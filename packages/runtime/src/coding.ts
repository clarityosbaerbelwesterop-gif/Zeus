import { RuntimeError } from "./index";

export type CodingPermissionMode = "read_only" | "workspace_write" | "repository_write";

export type CodingCapability =
  | "repository.read"
  | "repository.write"
  | "filesystem.read"
  | "filesystem.write"
  | "shell.execute"
  | "checkpoint.create"
  | "checkpoint.restore";

export interface CodingPolicy {
  readonly permissionMode: CodingPermissionMode;
  readonly allowedCapabilities: readonly CodingCapability[];
  readonly deniedCommands: readonly string[];
  readonly maxCommandMs: number;
  readonly maxOutputBytes: number;
  readonly completionRequirements: readonly CompletionRequirement[];
}

export interface CompletionRequirement {
  readonly id: string;
  readonly description: string;
  readonly required: boolean;
}

export interface CompletionEvidence {
  readonly requirementId: string;
  readonly passed: boolean;
  readonly safeDetail: string;
}

export interface CommandRequest {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface CodingCheckpoint {
  readonly id: string;
  readonly createdAt: string;
  readonly label: string;
}

export interface CodingEnvironment {
  readonly id: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly root: string;
  run(request: CommandRequest): Promise<CommandResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  checkpoint(label: string): Promise<CodingCheckpoint>;
  restore(checkpointId: string): Promise<void>;
  destroy(): Promise<void>;
}

export interface CodingEnvironmentProvider {
  create(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly repositoryUrl?: string;
    readonly revision?: string;
    readonly signal?: AbortSignal;
  }): Promise<CodingEnvironment>;
}

export const KAI_CODING_POLICY: CodingPolicy = Object.freeze({
  permissionMode: "workspace_write",
  allowedCapabilities: [
    "repository.read",
    "filesystem.read",
    "filesystem.write",
    "shell.execute",
    "checkpoint.create",
    "checkpoint.restore",
  ],
  deniedCommands: ["sudo", "su", "shutdown", "reboot", "mkfs", "mount", "umount"],
  maxCommandMs: 120_000,
  maxOutputBytes: 256_000,
  completionRequirements: [
    { id: "tests", description: "Relevant automated tests pass.", required: true },
    { id: "typecheck", description: "Static type checking passes when configured.", required: true },
    { id: "diff_review", description: "The resulting diff is reviewed before completion.", required: true },
  ],
});

function normalizeRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new RuntimeError("TOOL_INPUT_INVALID", "Path must be workspace-relative.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    throw new RuntimeError("TOOL_PERMISSION_DENIED", "Path escapes the coding workspace.");
  }
  return parts.join("/");
}

export function safeWorkspacePath(path: string): string {
  return normalizeRelativePath(path);
}

export function authorizeCommand(request: CommandRequest, policy = KAI_CODING_POLICY): CommandRequest {
  if (!request.argv.length || request.argv.some((part) => !part.trim())) {
    throw new RuntimeError("TOOL_INPUT_INVALID", "Command argv must contain non-empty values.");
  }
  const executable = request.argv[0]!.split("/").pop()!.toLowerCase();
  if (policy.deniedCommands.includes(executable)) {
    throw new RuntimeError("TOOL_PERMISSION_DENIED", `Command ${executable} is not permitted.`);
  }
  if (request.cwd) safeWorkspacePath(request.cwd);
  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? policy.maxCommandMs, 1_000), policy.maxCommandMs);
  return { ...request, timeoutMs };
}

export function assertCompletion(
  policy: CodingPolicy,
  evidence: readonly CompletionEvidence[],
): void {
  const byId = new Map(evidence.map((item) => [item.requirementId, item]));
  const failed = policy.completionRequirements.filter((requirement) => {
    if (!requirement.required) return false;
    const item = byId.get(requirement.id);
    return !item?.passed;
  });
  if (failed.length) {
    throw new RuntimeError(
      "VERIFICATION_FAILED",
      `Coding completion requirements not met: ${failed.map((item) => item.id).join(", ")}.`,
    );
  }
}
