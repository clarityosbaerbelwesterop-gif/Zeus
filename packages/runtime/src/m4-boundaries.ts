export type KaiPermissionMode = "read_only" | "supervised" | "autonomous";
export type CommandRisk = "read" | "write" | "network" | "dangerous";

export interface ExecutionLimits {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly maxWriteBytes: number;
}

export interface RepositoryAttachment {
  readonly repositoryFullName: string;
  readonly cloneUrl: string;
  readonly baseSha: string;
  readonly featureBranch: string;
  readonly connectionId?: string;
}

export interface RepositoryCredentials {
  readonly authorizationHeader: string;
  readonly expiresAt: Date;
}

export interface ExecutionEnvironment {
  readonly id: string;
  readonly name: string;
  readonly kind: "vercel-sandbox";
  readonly root: string;
  readonly workspaceId: string;
  readonly runId: string;
}

export interface SandboxCommand {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface SandboxCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

export interface SandboxProvider {
  getOrCreate(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly source: RepositoryAttachment;
    readonly credentials?: RepositoryCredentials;
  }): Promise<ExecutionEnvironment>;
  execute(environment: ExecutionEnvironment, command: SandboxCommand): Promise<SandboxCommandResult>;
  readFile(environment: ExecutionEnvironment, path: string): Promise<string>;
  writeFile(environment: ExecutionEnvironment, path: string, content: string): Promise<void>;
  stop(environment: ExecutionEnvironment): Promise<void>;
  destroy(environment: ExecutionEnvironment): Promise<void>;
}

export interface RepositoryTool {
  readonly repositoryId: string;
  readonly readOnly: boolean;
}

export interface FileWorkspace {
  readonly workspaceId: string;
  readonly root: string;
}

export interface RuntimeDelegationHook {
  delegate(input: {
    readonly parentRunId: string;
    readonly objective: string;
    readonly agent: string;
  }): Promise<{ readonly childRunId: string }>;
}

export interface CompletionRequirement {
  readonly toolId: string;
  readonly recoveryInstructions: string;
}

export class SandboxNotAvailableError extends Error {
  constructor(message = "Isolated sandbox execution is not configured for Zeus.") {
    super(message);
    this.name = "SandboxNotAvailableError";
  }
}

export class SandboxExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxExecutionError";
  }
}

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BRANCH_PATTERN = /^zeus\/[A-Za-z0-9._\/-]{1,180}$/;
const FORBIDDEN_BRANCHES = new Set(["main", "master", "production", "prod"]);
const DANGEROUS_COMMANDS = new Set([
  "sudo",
  "su",
  "mount",
  "umount",
  "mkfs",
  "fdisk",
  "reboot",
  "shutdown",
  "poweroff",
  "iptables",
  "nft",
]);
const NETWORK_COMMANDS = new Set(["curl", "wget", "ssh", "scp", "rsync", "nc", "ncat", "telnet"]);
const WRITE_COMMANDS = new Set([
  "git",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "python",
  "python3",
  "cargo",
  "go",
  "make",
  "cmake",
]);

export function validateRepositoryFullName(value: string): string {
  const trimmed = value.trim();
  if (!REPOSITORY_PATTERN.test(trimmed)) throw new Error("Repository must use owner/name format.");
  return trimmed;
}

export function validateBaseSha(value: string): string {
  const trimmed = value.trim();
  if (!SHA_PATTERN.test(trimmed)) throw new Error("Repository base SHA must be an exact 40-character commit SHA.");
  return trimmed.toLowerCase();
}

export function validateFeatureBranch(value: string): string {
  const trimmed = value.trim();
  if (FORBIDDEN_BRANCHES.has(trimmed.toLowerCase()) || !SAFE_BRANCH_PATTERN.test(trimmed)) {
    throw new Error("Kai may only work on a zeus/* feature branch, never a protected branch.");
  }
  if (trimmed.includes("..") || trimmed.includes("//") || trimmed.endsWith("/")) {
    throw new Error("Feature branch contains an unsafe ref sequence.");
  }
  return trimmed;
}

export function assertSafeRelativePath(value: string): string {
  const candidate = value.trim().replaceAll("\\", "/");
  if (!candidate || candidate.includes("\0") || candidate.startsWith("/") || /^[A-Za-z]:\//.test(candidate)) {
    throw new Error("Repository path must be a non-empty relative path.");
  }
  const parts = candidate.split("/").filter((part) => part && part !== ".");
  if (!parts.length || parts.some((part) => part === "..")) {
    throw new Error("Repository path escapes the workspace root.");
  }
  return parts.join("/");
}

export function classifyCommand(command: string, args: readonly string[] = []): CommandRisk {
  const binary = command.trim().split("/").at(-1)?.toLowerCase() ?? "";
  const joined = `${binary} ${args.join(" ")}`.toLowerCase();
  if (
    !binary ||
    DANGEROUS_COMMANDS.has(binary) ||
    /(^|\s)rm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\s+(\/|~|\.\.)(\s|$)/.test(joined) ||
    joined.includes("/dev/") ||
    joined.includes(":(){:|:&};:")
  ) {
    return "dangerous";
  }
  if (NETWORK_COMMANDS.has(binary) || (binary === "git" && ["push", "fetch", "pull", "clone"].includes(args[0]?.toLowerCase() ?? ""))) {
    return "network";
  }
  if (WRITE_COMMANDS.has(binary)) {
    if (binary === "git" && ["status", "diff", "show", "log", "rev-parse", "ls-files", "grep"].includes(args[0]?.toLowerCase() ?? "")) return "read";
    return "write";
  }
  return "read";
}

export function commandAllowed(mode: KaiPermissionMode, risk: CommandRisk): boolean {
  if (risk === "dangerous") return false;
  if (mode === "read_only") return risk === "read";
  if (mode === "supervised") return risk !== "network";
  return true;
}

export function truncateExecutionOutput(value: string, maximumBytes: number): { text: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maximumBytes) return { text: value, truncated: false };
  const clipped = new TextDecoder().decode(bytes.slice(0, Math.max(0, maximumBytes - 32)));
  return { text: `${clipped}\n[output truncated by Zeus]`, truncated: true };
}

export function completionRequirementSatisfied(
  requirement: CompletionRequirement | undefined,
  completedToolIds: readonly string[],
): boolean {
  return !requirement || completedToolIds.includes(requirement.toolId);
}

function extractString(value: unknown, keys: readonly string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const current = record[key];
    if (typeof current === "string") return current;
  }
  for (const nested of Object.values(record)) {
    const found = extractString(nested, keys);
    if (found) return found;
  }
  return "";
}

function extractNumber(value: unknown, keys: readonly string[]): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const current = record[key];
    if (typeof current === "number" && Number.isFinite(current)) return current;
  }
  for (const nested of Object.values(record)) {
    const found = extractNumber(nested, keys);
    if (found !== null) return found;
  }
  return null;
}

export interface VercelSandboxProviderOptions {
  readonly bearerToken?: string;
  readonly projectId?: string;
  readonly teamId?: string;
  readonly apiBaseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

export class VercelSandboxProvider implements SandboxProvider {
  readonly #token: string | undefined;
  readonly #projectId: string | undefined;
  readonly #teamId: string | undefined;
  readonly #apiBase: string;
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;

  constructor(options: VercelSandboxProviderOptions = {}) {
    this.#token = options.bearerToken ?? process.env.VERCEL_SANDBOX_BEARER_TOKEN ?? process.env.VERCEL_OIDC_TOKEN;
    this.#projectId = options.projectId ?? process.env.VERCEL_PROJECT_ID;
    this.#teamId = options.teamId ?? process.env.VERCEL_TEAM_ID;
    this.#apiBase = options.apiBaseUrl ?? "https://api.vercel.com";
    this.#timeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.#maxOutputBytes = options.maxOutputBytes ?? 96_000;
  }

  #assertConfigured(): { token: string; projectId: string } {
    if (!this.#token || !this.#projectId) {
      throw new SandboxNotAvailableError(
        "Zeus requires VERCEL_PROJECT_ID and VERCEL_OIDC_TOKEN (or VERCEL_SANDBOX_BEARER_TOKEN) before Kai can execute code.",
      );
    }
    return { token: this.#token, projectId: this.#projectId };
  }

  #query(extra: Record<string, string> = {}): string {
    const params = new URLSearchParams(extra);
    if (this.#teamId) params.set("teamId", this.#teamId);
    const encoded = params.toString();
    return encoded ? `?${encoded}` : "";
  }

  async #request(path: string, init: RequestInit = {}): Promise<unknown> {
    const { token } = this.#assertConfigured();
    const response = await fetch(`${this.#apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { text };
      }
    }
    if (!response.ok) {
      throw new SandboxExecutionError(`Vercel Sandbox request failed with status ${response.status}.`);
    }
    return payload;
  }

  async getOrCreate(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly source: RepositoryAttachment;
    readonly credentials?: RepositoryCredentials;
  }): Promise<ExecutionEnvironment> {
    const { projectId } = this.#assertConfigured();
    const safeWorkspace = input.workspaceId.replaceAll(/[^A-Za-z0-9-]/g, "").slice(0, 24);
    const safeRun = input.runId.replaceAll(/[^A-Za-z0-9-]/g, "").slice(0, 24);
    const name = `zeus-${safeWorkspace}-${safeRun}`.toLowerCase().slice(0, 63);
    const getPath = `/v2/sandboxes/${encodeURIComponent(name)}${this.#query({ projectId, resume: "true" })}`;
    let payload: unknown;
    try {
      payload = await this.#request(getPath, { method: "GET" });
    } catch (error) {
      if (!(error instanceof SandboxExecutionError)) throw error;
      const networkPolicy: Record<string, unknown> = {
        mode: "custom",
        allowedDomains: ["github.com", "api.github.com", "registry.npmjs.org", "*.npmjs.org"],
        allowedCIDRs: [],
        deniedCIDRs: [],
      };
      if (input.credentials) {
        networkPolicy.injectionRules = [
          {
            domain: "github.com",
            headers: { Authorization: input.credentials.authorizationHeader },
          },
        ];
      }
      payload = await this.#request(`/v2/sandboxes${this.#query()}`, {
        method: "POST",
        body: JSON.stringify({
          name,
          projectId,
          runtime: "node24",
          persistent: true,
          timeout: this.#timeoutMs,
          resources: { vcpus: 2, memory: 4096 },
          source: {
            type: "git",
            url: input.source.cloneUrl,
            depth: 100,
            revision: input.source.baseSha,
          },
          networkPolicy,
          tags: { product: "zeus", workspaceId: input.workspaceId, runId: input.runId },
        }),
      });
    }
    const id = extractString(payload, ["sessionId", "session_id", "id"]);
    if (!id) throw new SandboxExecutionError("Vercel Sandbox did not return an active session identifier.");
    const environment: ExecutionEnvironment = {
      id,
      name,
      kind: "vercel-sandbox",
      root: "/vercel/sandbox",
      workspaceId: input.workspaceId,
      runId: input.runId,
    };
    const branch = validateFeatureBranch(input.source.featureBranch);
    const baseSha = validateBaseSha(input.source.baseSha);
    const checkout = await this.execute(environment, {
      command: "git",
      args: ["checkout", "-B", branch, baseSha],
    });
    if (checkout.exitCode !== 0) throw new SandboxExecutionError("Sandbox could not pin the requested feature branch to the exact base SHA.");
    return environment;
  }

  async execute(environment: ExecutionEnvironment, command: SandboxCommand): Promise<SandboxCommandResult> {
    this.#assertConfigured();
    const risk = classifyCommand(command.command, command.args ?? []);
    if (risk === "dangerous") throw new SandboxExecutionError("Dangerous command blocked by Zeus before sandbox dispatch.");
    const cwd = command.cwd ? `${environment.root}/${assertSafeRelativePath(command.cwd)}` : environment.root;
    const cmdId = `zeus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const payload = await this.#request(
      `/v2/sandboxes/sessions/${encodeURIComponent(environment.id)}/cmd${this.#query({ cmdId })}`,
      {
        method: "POST",
        body: JSON.stringify({
          command: command.command,
          args: [...(command.args ?? [])],
          cwd,
          sudo: false,
          wait: true,
          logs: true,
          timeout: command.timeoutMs ?? this.#timeoutMs,
        }),
      },
    );
    const stdoutRaw = extractString(payload, ["stdout", "output", "text"]);
    const stderrRaw = extractString(payload, ["stderr", "error"]);
    const stdout = truncateExecutionOutput(stdoutRaw, this.#maxOutputBytes);
    const stderr = truncateExecutionOutput(stderrRaw, this.#maxOutputBytes);
    return {
      exitCode: extractNumber(payload, ["exitCode", "exit_code", "code"]) ?? (stderrRaw ? 1 : 0),
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated,
    };
  }

  async readFile(environment: ExecutionEnvironment, path: string): Promise<string> {
    const safePath = assertSafeRelativePath(path);
    const result = await this.execute(environment, {
      command: "node",
      args: [
        "-e",
        "const fs=require('node:fs');process.stdout.write(fs.readFileSync(process.argv[1]).toString('base64'))",
        safePath,
      ],
    });
    if (result.exitCode !== 0) throw new SandboxExecutionError("Sandbox file read failed.");
    return Buffer.from(result.stdout.trim(), "base64").toString("utf8");
  }

  async writeFile(environment: ExecutionEnvironment, path: string, content: string): Promise<void> {
    const safePath = assertSafeRelativePath(path);
    const encoded = Buffer.from(content, "utf8").toString("base64");
    const result = await this.execute(environment, {
      command: "node",
      args: [
        "-e",
        "const fs=require('node:fs');const p=require('node:path');const f=process.argv[1];fs.mkdirSync(p.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from(process.argv[2],'base64'))",
        safePath,
        encoded,
      ],
    });
    if (result.exitCode !== 0) throw new SandboxExecutionError("Sandbox file write failed.");
  }

  async stop(environment: ExecutionEnvironment): Promise<void> {
    await this.#request(`/v2/sandboxes/sessions/${encodeURIComponent(environment.id)}/stop${this.#query()}`, { method: "POST" });
  }

  async destroy(environment: ExecutionEnvironment): Promise<void> {
    const { projectId } = this.#assertConfigured();
    await this.#request(`/v2/sandboxes/${encodeURIComponent(environment.name)}${this.#query({ projectId })}`, { method: "DELETE" });
  }
}
