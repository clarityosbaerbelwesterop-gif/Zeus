import {
  connections,
  executionCheckpoints,
  executionSessions,
  repositoryBindings,
  repositoryChangeRequests,
  verificationResults,
  withActor,
} from "@zeus/db";
import { RuntimeError, type ToolDefinition, type ToolExecutionContext, type ToolRegistry } from "@zeus/runtime";
import {
  SandboxExecutionError,
  SandboxNotAvailableError,
  VercelSandboxProvider,
  assertSafeRelativePath,
  classifyCommand,
  commandAllowed,
  validateBaseSha,
  validateFeatureBranch,
  validateRepositoryFullName,
  type ExecutionEnvironment,
  type RepositoryAttachment,
  type RepositoryCredentials,
  type SandboxCommandResult,
} from "@zeus/runtime/m4";
import { and, desc, eq } from "drizzle-orm";

const MAX_FILE_BYTES = 256_000;
const MAX_DIFF_BYTES = 96_000;
const QUALITY_GATES = new Set(["test", "lint", "typecheck", "build"]);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
] as const;

function objectInput(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeError("TOOL_INPUT_INVALID", "Tool input must be an object.");
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(input: Readonly<Record<string, unknown>>, key: string, maximum = 12_000): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new RuntimeError("TOOL_INPUT_INVALID", `${key} is required.`);
  }
  return value.trim().slice(0, maximum);
}

function optionalString(input: Readonly<Record<string, unknown>>, key: string, maximum = 12_000): string | null {
  const value = input[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new RuntimeError("TOOL_INPUT_INVALID", `${key} must be text.`);
  return value.trim().slice(0, maximum) || null;
}

function stringArray(input: Readonly<Record<string, unknown>>, key: string, maxItems = 32): readonly string[] {
  const value = input[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string")) {
    throw new RuntimeError("TOOL_INPUT_INVALID", `${key} must be an array of text values.`);
  }
  return value.map((item) => String(item).slice(0, 2_000));
}

function tool<TInput extends Readonly<Record<string, unknown>>, TOutput>(input: {
  id: string;
  name: string;
  description: string;
  sideEffect: 0 | 1 | 2 | 3;
  timeoutMs?: number;
  parse(value: unknown): TInput;
  execute(value: TInput, context: ToolExecutionContext): Promise<TOutput>;
  summarizeInput?: (value: TInput) => string;
  summarizeOutput?: (value: TOutput) => string;
}): ToolDefinition<TInput, TOutput> {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    inputSchema: { type: "object", additionalProperties: true },
    outputContract: "Structured, bounded execution evidence. Secrets and raw credentials are never returned.",
    sideEffect: input.sideEffect,
    allowedAgents: ["kai"],
    workspaceRequired: true,
    timeoutMs: input.timeoutMs ?? 10 * 60_000,
    parse: input.parse,
    execute: input.execute,
    summarizeInput: input.summarizeInput ?? (() => `${input.id} requested.`),
    summarizeOutput: input.summarizeOutput ?? (() => `${input.id} completed.`),
  };
}

interface BindingSnapshot {
  id: string;
  workspaceId: string;
  repositoryFullName: string;
  cloneUrl: string;
  defaultBranch: string;
  baseSha: string;
  featureBranch: string;
  connectionId: string | null;
}

async function loadBinding(actorId: string, workspaceId: string): Promise<BindingSnapshot> {
  return withActor(actorId, async (db) => {
    const row = (
      await db
        .select()
        .from(repositoryBindings)
        .where(eq(repositoryBindings.workspaceId, workspaceId))
        .orderBy(desc(repositoryBindings.updatedAt))
        .limit(1)
    )[0];
    if (!row) throw new RuntimeError("CONNECTION_REQUIRED", "No repository is attached to this workspace.");
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      repositoryFullName: row.repositoryFullName,
      cloneUrl: row.cloneUrl,
      defaultBranch: row.defaultBranch,
      baseSha: row.baseSha,
      featureBranch: row.featureBranch,
      connectionId: row.connectionId,
    };
  });
}

async function resolveRepositoryToken(actorId: string, binding: BindingSnapshot): Promise<{ token: string; credentials: RepositoryCredentials } | null> {
  if (!binding.connectionId) return null;
  const connection = await withActor(actorId, async (db) => {
    return (
      await db
        .select({ status: connections.status, provider: connections.provider, secretRef: connections.secretRef })
        .from(connections)
        .where(and(eq(connections.id, binding.connectionId!), eq(connections.workspaceId, binding.workspaceId)))
        .limit(1)
    )[0];
  });
  if (!connection || connection.status !== "connected" || connection.provider !== "github" || !connection.secretRef) {
    throw new RuntimeError("CONNECTION_REQUIRED", "The attached GitHub connection is not ready.");
  }
  if (!connection.secretRef.startsWith("env:")) {
    throw new RuntimeError("CONNECTION_REQUIRED", "GitHub credential broker reference is unsupported by this deployment.");
  }
  const key = connection.secretRef.slice(4);
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(key)) {
    throw new RuntimeError("CONNECTION_REQUIRED", "GitHub credential reference is invalid.");
  }
  const token = process.env[key];
  const expiry = process.env[`${key}_EXPIRES_AT`];
  if (!token || !expiry) throw new RuntimeError("CONNECTION_REQUIRED", "Short-lived GitHub credentials are unavailable.");
  const expiresAt = new Date(expiry);
  const remainingMs = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(expiresAt.getTime()) || remainingMs < 60_000 || remainingMs > 2 * 60 * 60_000) {
    throw new RuntimeError("CONNECTION_REQUIRED", "GitHub credentials are expired or are not short-lived.");
  }
  return {
    token,
    credentials: {
      authorizationHeader: `Basic ${Buffer.from(`x-access-token:${token}`, "utf8").toString("base64")}`,
      expiresAt,
    },
  };
}

function attachment(binding: BindingSnapshot): RepositoryAttachment {
  return {
    repositoryFullName: binding.repositoryFullName,
    cloneUrl: binding.cloneUrl,
    baseSha: binding.baseSha,
    featureBranch: binding.featureBranch,
    ...(binding.connectionId ? { connectionId: binding.connectionId } : {}),
  };
}

async function ensureEnvironment(context: ToolExecutionContext): Promise<{ binding: BindingSnapshot; environment: ExecutionEnvironment; token: string | null }> {
  const binding = await loadBinding(context.actorId, context.workspaceId);
  const resolved = await resolveRepositoryToken(context.actorId, binding);
  const provider = new VercelSandboxProvider();
  let environment: ExecutionEnvironment;
  try {
    environment = await provider.getOrCreate({
      workspaceId: context.workspaceId,
      runId: context.runId,
      source: attachment(binding),
      ...(resolved ? { credentials: resolved.credentials } : {}),
    });
  } catch (error) {
    if (error instanceof SandboxNotAvailableError) {
      throw new RuntimeError("CONNECTION_REQUIRED", error.message);
    }
    if (error instanceof SandboxExecutionError) {
      throw new RuntimeError("TOOL_EXECUTION_FAILED", error.message, true);
    }
    throw error;
  }
  const head = await provider.execute(environment, { command: "git", args: ["rev-parse", "HEAD"] });
  if (head.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Sandbox repository HEAD could not be verified.");
  const currentHeadSha = validateBaseSha(head.stdout.trim());
  await withActor(context.actorId, async (db) => {
    const existing = (
      await db.select({ id: executionSessions.id }).from(executionSessions).where(eq(executionSessions.runId, context.runId)).limit(1)
    )[0];
    if (existing) {
      await db
        .update(executionSessions)
        .set({
          sandboxName: environment.name,
          sandboxSessionId: environment.id,
          status: "active",
          rootPath: environment.root,
          currentHeadSha,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(executionSessions.id, existing.id));
    } else {
      await db.insert(executionSessions).values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        runId: context.runId,
        repositoryBindingId: binding.id,
        sandboxName: environment.name,
        sandboxSessionId: environment.id,
        status: "active",
        permissionMode: "supervised",
        rootPath: environment.root,
        baseSha: binding.baseSha,
        currentHeadSha,
      });
    }
  });
  return { binding, environment, token: resolved?.token ?? null };
}

async function run(context: ToolExecutionContext, command: string, args: readonly string[] = [], cwd?: string): Promise<SandboxCommandResult> {
  const { environment } = await ensureEnvironment(context);
  const provider = new VercelSandboxProvider();
  const result = await provider.execute(environment, { command, args, ...(cwd ? { cwd } : {}) });
  return result;
}

async function assertContained(context: ToolExecutionContext, path: string, forWrite: boolean): Promise<string> {
  const safePath = assertSafeRelativePath(path);
  const { environment } = await ensureEnvironment(context);
  const provider = new VercelSandboxProvider();
  const script = forWrite
    ? "const fs=require('node:fs'),p=require('node:path');const root=fs.realpathSync('.');const target=p.resolve(process.argv[1]);let probe=p.dirname(target);while(!fs.existsSync(probe)&&probe!==root)probe=p.dirname(probe);const real=fs.realpathSync(probe);if(real!==root&&!real.startsWith(root+p.sep))process.exit(42)"
    : "const fs=require('node:fs'),p=require('node:path');const root=fs.realpathSync('.');const real=fs.realpathSync(process.argv[1]);if(real!==root&&!real.startsWith(root+p.sep))process.exit(42)";
  const result = await provider.execute(environment, { command: "node", args: ["-e", script, safePath] });
  if (result.exitCode !== 0) throw new RuntimeError("TOOL_PERMISSION_DENIED", "Repository path resolves outside the sandbox worktree.");
  return safePath;
}

async function recordQuality(context: ToolExecutionContext, gate: string, result: SandboxCommandResult): Promise<void> {
  await withActor(context.actorId, async (db) => {
    await db.insert(verificationResults).values({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      runId: context.runId,
      status: result.exitCode === 0 ? "passed" : "failed",
      checkName: `quality:${gate}`,
      safeDetail: `Sandbox ${gate} exited with code ${result.exitCode}${result.truncated ? "; output truncated" : ""}.`,
    });
  });
}

async function packageManager(context: ToolExecutionContext): Promise<"pnpm" | "npm" | "yarn" | "bun"> {
  const { environment } = await ensureEnvironment(context);
  const provider = new VercelSandboxProvider();
  const result = await provider.readFile(environment, "package.json");
  try {
    const parsed = JSON.parse(result) as { packageManager?: string };
    const name = parsed.packageManager?.split("@")[0];
    if (name === "pnpm" || name === "npm" || name === "yarn" || name === "bun") return name;
  } catch {
    // fall through to lockfile detection
  }
  for (const [file, name] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ] as const) {
    const check = await provider.execute(environment, { command: "git", args: ["ls-files", "--error-unmatch", file] });
    if (check.exitCode === 0) return name;
  }
  return "npm";
}

async function executeQualityGate(context: ToolExecutionContext, gate: string): Promise<SandboxCommandResult> {
  if (!QUALITY_GATES.has(gate)) throw new RuntimeError("TOOL_INPUT_INVALID", "Unknown quality gate.");
  const manager = await packageManager(context);
  const args = manager === "npm" || manager === "bun" ? ["run", gate] : [gate];
  const result = await run(context, manager, args);
  await recordQuality(context, gate, result);
  return result;
}

function safeCommandOutput(result: SandboxCommandResult): { exitCode: number; stdout: string; stderr: string; truncated: boolean } {
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, MAX_DIFF_BYTES),
    stderr: result.stderr.slice(0, 16_000),
    truncated: result.truncated || result.stdout.length > MAX_DIFF_BYTES || result.stderr.length > 16_000,
  };
}

function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

async function currentBranchAndHead(context: ToolExecutionContext): Promise<{ branch: string; head: string; binding: BindingSnapshot }> {
  const binding = await loadBinding(context.actorId, context.workspaceId);
  const branch = await run(context, "git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = await run(context, "git", ["rev-parse", "HEAD"]);
  if (branch.exitCode !== 0 || head.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Git branch state could not be verified.");
  const actualBranch = branch.stdout.trim();
  if (actualBranch !== binding.featureBranch) throw new RuntimeError("TOOL_PERMISSION_DENIED", "Sandbox is not on the attached zeus/* feature branch.");
  return { branch: actualBranch, head: validateBaseSha(head.stdout.trim()), binding };
}

const repositoryToolDefinitions: readonly ToolDefinition[] = [
  tool({
    id: "repo.attach",
    name: "Attach GitHub repository",
    description: "Pin a workspace to one GitHub repository, exact base commit SHA, and zeus/* feature branch without starting a sandbox.",
    sideEffect: 1,
    parse(value) {
      const input = objectInput(value);
      const repositoryFullName = validateRepositoryFullName(requiredString(input, "repositoryFullName", 240));
      const baseSha = validateBaseSha(requiredString(input, "baseSha", 40));
      const featureBranch = validateFeatureBranch(requiredString(input, "featureBranch", 200));
      const defaultBranch = optionalString(input, "defaultBranch", 200) ?? "main";
      const connectionId = optionalString(input, "connectionId", 80);
      return { repositoryFullName, baseSha, featureBranch, defaultBranch, connectionId };
    },
    async execute(input, context) {
      const cloneUrl = `https://github.com/${input.repositoryFullName}.git`;
      return withActor(context.actorId, async (db) => {
        const existing = (
          await db.select({ id: repositoryBindings.id }).from(repositoryBindings).where(
            and(eq(repositoryBindings.workspaceId, context.workspaceId), eq(repositoryBindings.repositoryFullName, input.repositoryFullName)),
          ).limit(1)
        )[0];
        if (existing) {
          await db.update(repositoryBindings).set({
            cloneUrl,
            defaultBranch: input.defaultBranch,
            baseSha: input.baseSha,
            featureBranch: input.featureBranch,
            connectionId: input.connectionId,
            updatedAt: new Date(),
          }).where(eq(repositoryBindings.id, existing.id));
          return { bindingId: existing.id, repositoryFullName: input.repositoryFullName, baseSha: input.baseSha, featureBranch: input.featureBranch };
        }
        const row = (
          await db.insert(repositoryBindings).values({
            organizationId: context.organizationId,
            workspaceId: context.workspaceId,
            repositoryFullName: input.repositoryFullName,
            cloneUrl,
            defaultBranch: input.defaultBranch,
            baseSha: input.baseSha,
            featureBranch: input.featureBranch,
            connectionId: input.connectionId,
            createdBy: context.actorId,
          }).returning({ id: repositoryBindings.id })
        )[0];
        if (!row) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Repository binding was not persisted.");
        return { bindingId: row.id, repositoryFullName: input.repositoryFullName, baseSha: input.baseSha, featureBranch: input.featureBranch };
      });
    },
    summarizeInput: (input) => `Attach ${input.repositoryFullName} at exact base ${input.baseSha.slice(0, 12)} on ${input.featureBranch}.`,
    summarizeOutput: (output) => `Repository ${output.repositoryFullName} attached at ${output.baseSha.slice(0, 12)} on ${output.featureBranch}.`,
  }),
  tool({
    id: "repo.map",
    name: "Map repository",
    description: "List tracked repository files from the isolated sandbox.",
    sideEffect: 0,
    parse: () => ({}),
    async execute(_input, context) {
      return safeCommandOutput(await run(context, "git", ["ls-files"]));
    },
  }),
  tool({
    id: "repo.read_file",
    name: "Read repository file",
    description: "Read one bounded file after traversal and symlink containment checks.",
    sideEffect: 0,
    parse(value) {
      const input = objectInput(value);
      return { path: assertSafeRelativePath(requiredString(input, "path", 1_024)) };
    },
    async execute(input, context) {
      const safePath = await assertContained(context, input.path, false);
      const { environment } = await ensureEnvironment(context);
      const content = await new VercelSandboxProvider().readFile(environment, safePath);
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new RuntimeError("TOOL_EXECUTION_FAILED", "File exceeds the bounded read limit.");
      return { path: safePath, content };
    },
    summarizeOutput: (output) => `Read ${output.path} (${Buffer.byteLength(output.content, "utf8")} bytes).`,
  }),
  tool({
    id: "repo.search",
    name: "Search repository",
    description: "Search tracked files using git grep with fixed-string matching.",
    sideEffect: 0,
    parse(value) {
      const input = objectInput(value);
      return { query: requiredString(input, "query", 500), path: optionalString(input, "path", 1_024) };
    },
    async execute(input, context) {
      const args = ["grep", "-n", "--fixed-strings", "--", input.query];
      if (input.path) args.push(await assertContained(context, input.path, false));
      return safeCommandOutput(await run(context, "git", args));
    },
  }),
  tool({
    id: "repo.write_file",
    name: "Write repository file",
    description: "Write one bounded file inside the isolated repository after path and symlink containment checks.",
    sideEffect: 2,
    parse(value) {
      const input = objectInput(value);
      const path = assertSafeRelativePath(requiredString(input, "path", 1_024));
      const content = requiredString(input, "content", MAX_FILE_BYTES);
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new RuntimeError("TOOL_INPUT_INVALID", "File content exceeds the write limit.");
      return { path, content };
    },
    async execute(input, context) {
      const safePath = await assertContained(context, input.path, true);
      const { environment } = await ensureEnvironment(context);
      await new VercelSandboxProvider().writeFile(environment, safePath, input.content);
      return { path: safePath, bytes: Buffer.byteLength(input.content, "utf8") };
    },
  }),
  tool({
    id: "repo.run_command",
    name: "Run bounded repository command",
    description: "Execute a structured command without a shell in the isolated sandbox. Dangerous and supervised network commands are denied.",
    sideEffect: 2,
    parse(value) {
      const input = objectInput(value);
      const command = requiredString(input, "command", 120);
      if (!/^[A-Za-z0-9._+/-]+$/.test(command)) throw new RuntimeError("TOOL_INPUT_INVALID", "Command contains unsupported characters.");
      const args = stringArray(input, "args");
      const cwd = optionalString(input, "cwd", 1_024);
      return { command, args, cwd };
    },
    async execute(input, context) {
      const risk = classifyCommand(input.command, input.args);
      if (!commandAllowed("supervised", risk)) throw new RuntimeError("TOOL_PERMISSION_DENIED", `Command risk ${risk} is not permitted in supervised mode.`);
      return safeCommandOutput(await run(context, input.command, input.args, input.cwd ?? undefined));
    },
  }),
  tool({
    id: "repo.run_quality_gate",
    name: "Run repository quality gate",
    description: "Run one canonical test, lint, typecheck, or build script and persist verification evidence.",
    sideEffect: 2,
    parse(value) {
      const gate = requiredString(objectInput(value), "gate", 32);
      if (!QUALITY_GATES.has(gate)) throw new RuntimeError("TOOL_INPUT_INVALID", "gate must be test, lint, typecheck, or build.");
      return { gate };
    },
    async execute(input, context) {
      return safeCommandOutput(await executeQualityGate(context, input.gate));
    },
  }),
  tool({
    id: "repo.git_status",
    name: "Read Git status",
    description: "Read branch and working tree status from the isolated repository.",
    sideEffect: 0,
    parse: () => ({}),
    async execute(_input, context) {
      return safeCommandOutput(await run(context, "git", ["status", "--short", "--branch"]));
    },
  }),
  tool({
    id: "repo.git_diff",
    name: "Read Git diff",
    description: "Read a bounded repository diff without exposing credentials.",
    sideEffect: 0,
    parse(value) {
      const input = objectInput(value);
      return { staged: input.staged === true };
    },
    async execute(input, context) {
      return safeCommandOutput(await run(context, "git", input.staged ? ["diff", "--cached", "--"] : ["diff", "--"]));
    },
  }),
  tool({
    id: "repo.git_commit",
    name: "Create local Git commit",
    description: "Stage repository changes, scan the staged diff for common secret material, and create a local commit on the zeus/* branch. This never pushes.",
    sideEffect: 3,
    parse(value) {
      const message = requiredString(objectInput(value), "message", 240).replaceAll(/[\r\n]+/g, " ");
      return { message };
    },
    async execute(input, context) {
      await currentBranchAndHead(context);
      const stage = await run(context, "git", ["add", "-A"]);
      if (stage.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Git staging failed.");
      const diff = await run(context, "git", ["diff", "--cached", "--"]);
      if (diff.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Staged diff could not be inspected.");
      if (!diff.stdout.trim()) throw new RuntimeError("TOOL_INPUT_INVALID", "There are no staged changes to commit.");
      if (containsSecret(diff.stdout)) {
        await run(context, "git", ["reset"]);
        throw new RuntimeError("TOOL_PERMISSION_DENIED", "Potential secret material detected in the staged diff; commit blocked.");
      }
      const committed = await run(context, "git", ["commit", "-m", input.message]);
      if (committed.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Local commit failed.");
      const state = await currentBranchAndHead(context);
      return { branch: state.branch, headSha: state.head, summary: committed.stdout.slice(0, 4_096) };
    },
  }),
  tool({
    id: "repo.checkpoint",
    name: "Checkpoint repository worktree",
    description: "Persist current HEAD and an optional git stash object without altering the working tree.",
    sideEffect: 1,
    parse(value) {
      return { label: requiredString(objectInput(value), "label", 240) };
    },
    async execute(input, context) {
      const state = await currentBranchAndHead(context);
      const stash = await run(context, "git", ["stash", "create", `zeus checkpoint: ${input.label}`]);
      if (stash.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Checkpoint worktree snapshot failed.");
      const worktreeSha = stash.stdout.trim() ? validateBaseSha(stash.stdout.trim()) : null;
      const stat = await run(context, "git", ["diff", "--stat", state.head, "--"]);
      const session = await withActor(context.actorId, async (db) => (
        await db.select({ id: executionSessions.id }).from(executionSessions).where(eq(executionSessions.runId, context.runId)).limit(1)
      )[0]);
      if (!session) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Execution session was not persisted.");
      const row = await withActor(context.actorId, async (db) => (
        await db.insert(executionCheckpoints).values({
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          runId: context.runId,
          executionSessionId: session.id,
          label: input.label,
          headSha: state.head,
          worktreeSha,
          safeDiffSummary: stat.stdout.slice(0, 4_096),
          createdBy: context.actorId,
        }).returning({ id: executionCheckpoints.id })
      )[0]);
      if (!row) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Checkpoint was not persisted.");
      return { checkpointId: row.id, headSha: state.head, hasWorktreeSnapshot: Boolean(worktreeSha) };
    },
  }),
  tool({
    id: "repo.rewind",
    name: "Rewind to repository checkpoint",
    description: "Restore a prior run checkpoint only inside the isolated sandbox worktree.",
    sideEffect: 3,
    parse(value) {
      return { checkpointId: requiredString(objectInput(value), "checkpointId", 80) };
    },
    async execute(input, context) {
      const checkpoint = await withActor(context.actorId, async (db) => (
        await db.select().from(executionCheckpoints).where(and(eq(executionCheckpoints.id, input.checkpointId), eq(executionCheckpoints.runId, context.runId))).limit(1)
      )[0]);
      if (!checkpoint) throw new RuntimeError("TOOL_INPUT_INVALID", "Checkpoint does not belong to this run.");
      const reset = await run(context, "git", ["reset", "--hard", checkpoint.headSha]);
      if (reset.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Checkpoint HEAD restore failed.");
      const clean = await run(context, "git", ["clean", "-fd"]);
      if (clean.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Checkpoint clean restore failed.");
      if (checkpoint.worktreeSha) {
        const apply = await run(context, "git", ["stash", "apply", "--index", checkpoint.worktreeSha]);
        if (apply.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Checkpoint worktree restore failed.");
      }
      return { checkpointId: checkpoint.id, restoredHeadSha: checkpoint.headSha, restoredWorktree: Boolean(checkpoint.worktreeSha) };
    },
  }),
  tool({
    id: "repo.complete",
    name: "Verify coding completion",
    description: "Run all canonical repository quality gates and persist deterministic completion evidence. Kai cannot finish a coding run without this tool.",
    sideEffect: 2,
    timeoutMs: 20 * 60_000,
    parse: () => ({}),
    async execute(_input, context) {
      const evidence: Array<{ gate: string; exitCode: number }> = [];
      for (const gate of ["lint", "typecheck", "test", "build"]) {
        const result = await executeQualityGate(context, gate);
        evidence.push({ gate, exitCode: result.exitCode });
        if (result.exitCode !== 0) {
          throw new RuntimeError("VERIFICATION_FAILED", `${gate} failed in the isolated sandbox; repair is required before completion.`);
        }
      }
      const state = await currentBranchAndHead(context);
      await withActor(context.actorId, async (db) => {
        await db.insert(verificationResults).values({
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          runId: context.runId,
          status: "passed",
          checkName: "m4:completion",
          safeDetail: `Kai completion contract passed at ${state.head.slice(0, 12)} on ${state.branch}.`,
        });
      });
      return { branch: state.branch, headSha: state.head, gates: evidence, completion: "verified" };
    },
  }),
  tool({
    id: "repo.prepare_push",
    name: "Prepare feature branch push",
    description: "Persist an exact push request for user approval. This tool never pushes by itself.",
    sideEffect: 1,
    parse: () => ({}),
    async execute(_input, context) {
      const state = await currentBranchAndHead(context);
      const row = await withActor(context.actorId, async (db) => (
        await db.insert(repositoryChangeRequests).values({
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          runId: context.runId,
          repositoryBindingId: state.binding.id,
          operation: "push",
          headBranch: state.branch,
          baseBranch: state.binding.defaultBranch,
          expectedHeadSha: state.head,
          createdBy: context.actorId,
        }).onConflictDoNothing().returning({ id: repositoryChangeRequests.id })
      )[0]);
      if (row) return { requestId: row.id, status: "pending_approval", expectedHeadSha: state.head, branch: state.branch };
      const existing = await withActor(context.actorId, async (db) => (
        await db.select({ id: repositoryChangeRequests.id }).from(repositoryChangeRequests).where(
          and(eq(repositoryChangeRequests.runId, context.runId), eq(repositoryChangeRequests.operation, "push"), eq(repositoryChangeRequests.expectedHeadSha, state.head)),
        ).limit(1)
      )[0]);
      if (!existing) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Push approval request could not be persisted.");
      return { requestId: existing.id, status: "pending_approval", expectedHeadSha: state.head, branch: state.branch };
    },
  }),
  tool({
    id: "repo.prepare_pull_request",
    name: "Prepare pull request",
    description: "Persist an exact pull request request for explicit user approval. This tool never opens a PR by itself.",
    sideEffect: 1,
    parse(value) {
      const input = objectInput(value);
      return { title: requiredString(input, "title", 240), body: optionalString(input, "body", 12_000) ?? "" };
    },
    async execute(input, context) {
      const state = await currentBranchAndHead(context);
      const pushed = await withActor(context.actorId, async (db) => (
        await db.select({ id: repositoryChangeRequests.id }).from(repositoryChangeRequests).where(
          and(
            eq(repositoryChangeRequests.runId, context.runId),
            eq(repositoryChangeRequests.operation, "push"),
            eq(repositoryChangeRequests.expectedHeadSha, state.head),
            eq(repositoryChangeRequests.status, "completed"),
          ),
        ).limit(1)
      )[0]);
      if (!pushed) throw new RuntimeError("TOOL_PERMISSION_DENIED", "The exact feature branch HEAD must be approved and pushed before preparing a pull request.");
      const row = await withActor(context.actorId, async (db) => (
        await db.insert(repositoryChangeRequests).values({
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          runId: context.runId,
          repositoryBindingId: state.binding.id,
          operation: "pull_request",
          headBranch: state.branch,
          baseBranch: state.binding.defaultBranch,
          expectedHeadSha: state.head,
          safeTitle: input.title,
          safeBody: input.body,
          createdBy: context.actorId,
        }).onConflictDoNothing().returning({ id: repositoryChangeRequests.id })
      )[0]);
      if (!row) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Pull request approval request already exists or could not be persisted.");
      return { requestId: row.id, status: "pending_approval", expectedHeadSha: state.head, branch: state.branch, base: state.binding.defaultBranch };
    },
  }),
];

export function registerKaiCodingTools(registry: ToolRegistry): void {
  for (const definition of repositoryToolDefinitions) registry.register(definition);
}

export async function listRunRepositoryChangeRequests(actorId: string, runId: string) {
  return withActor(actorId, async (db) =>
    db.select().from(repositoryChangeRequests).where(eq(repositoryChangeRequests.runId, runId)).orderBy(repositoryChangeRequests.createdAt),
  );
}

async function loadChangeRequest(actorId: string, requestId: string) {
  return withActor(actorId, async (db) => {
    const request = (
      await db.select().from(repositoryChangeRequests).where(eq(repositoryChangeRequests.id, requestId)).limit(1)
    )[0];
    if (!request) throw new RuntimeError("WORKSPACE_ACCESS_DENIED", "Repository change request not found.");
    const binding = (
      await db.select().from(repositoryBindings).where(eq(repositoryBindings.id, request.repositoryBindingId)).limit(1)
    )[0];
    if (!binding) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Repository binding for change request is missing.");
    return { request, binding };
  });
}

export async function approveAndExecuteRepositoryChangeRequest(actorId: string, requestId: string): Promise<{ status: string; externalUrl?: string }> {
  const initial = await loadChangeRequest(actorId, requestId);
  if (initial.request.status !== "pending") throw new RuntimeError("TOOL_INPUT_INVALID", "Repository change request is not pending approval.");
  await withActor(actorId, async (db) => {
    await db.update(repositoryChangeRequests).set({ status: "approved", approvedBy: actorId, approvedAt: new Date(), updatedAt: new Date() }).where(
      and(eq(repositoryChangeRequests.id, requestId), eq(repositoryChangeRequests.status, "pending")),
    );
  });
  const { request, binding } = await loadChangeRequest(actorId, requestId);
  const tokenData = await resolveRepositoryToken(actorId, {
    id: binding.id,
    workspaceId: binding.workspaceId,
    repositoryFullName: binding.repositoryFullName,
    cloneUrl: binding.cloneUrl,
    defaultBranch: binding.defaultBranch,
    baseSha: binding.baseSha,
    featureBranch: binding.featureBranch,
    connectionId: binding.connectionId,
  });
  if (!tokenData) throw new RuntimeError("CONNECTION_REQUIRED", "Approved GitHub write requires a short-lived connected GitHub credential.");
  await withActor(actorId, async (db) => {
    await db.update(repositoryChangeRequests).set({ status: "executing", updatedAt: new Date() }).where(eq(repositoryChangeRequests.id, requestId));
  });
  try {
    if (request.operation === "push") {
      const session = await withActor(actorId, async (db) => (
        await db.select().from(executionSessions).where(eq(executionSessions.runId, request.runId)).limit(1)
      )[0]);
      if (!session) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Approved push has no persisted sandbox session.");
      const environment: ExecutionEnvironment = {
        id: session.sandboxSessionId,
        name: session.sandboxName,
        kind: "vercel-sandbox",
        root: session.rootPath,
        workspaceId: session.workspaceId,
        runId: session.runId,
      };
      const provider = new VercelSandboxProvider();
      const head = await provider.execute(environment, { command: "git", args: ["rev-parse", "HEAD"] });
      if (head.exitCode !== 0 || head.stdout.trim().toLowerCase() !== request.expectedHeadSha.toLowerCase()) {
        throw new RuntimeError("STALE_RUN", "Feature branch HEAD changed after approval request; push blocked.");
      }
      const pushed = await provider.execute(environment, { command: "git", args: ["push", "origin", `${request.headBranch}:${request.headBranch}`], timeoutMs: 10 * 60_000 });
      if (pushed.exitCode !== 0) throw new RuntimeError("TOOL_EXECUTION_FAILED", "Approved feature branch push failed.");
      await withActor(actorId, async (db) => {
        await db.update(repositoryChangeRequests).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(repositoryChangeRequests.id, requestId));
      });
      return { status: "completed" };
    }
    const response = await fetch(`https://api.github.com/repos/${binding.repositoryFullName}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: request.safeTitle,
        body: request.safeBody,
        head: request.headBranch,
        base: request.baseBranch,
      }),
      cache: "no-store",
    });
    const payload = (await response.json()) as { number?: number; html_url?: string };
    if (!response.ok || typeof payload.number !== "number" || !payload.html_url) {
      throw new RuntimeError("TOOL_EXECUTION_FAILED", `GitHub pull request creation failed with status ${response.status}.`);
    }
    await withActor(actorId, async (db) => {
      await db.update(repositoryChangeRequests).set({
        status: "completed",
        externalNumber: payload.number,
        externalUrl: payload.html_url,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(repositoryChangeRequests.id, requestId));
    });
    return { status: "completed", externalUrl: payload.html_url };
  } catch (error) {
    const safeError = error instanceof RuntimeError ? `${error.code}: ${error.message}` : "Repository change execution failed.";
    await withActor(actorId, async (db) => {
      await db.update(repositoryChangeRequests).set({ status: "failed", safeError: safeError.slice(0, 4_096), updatedAt: new Date() }).where(eq(repositoryChangeRequests.id, requestId));
    }).catch(() => undefined);
    throw error;
  }
}
