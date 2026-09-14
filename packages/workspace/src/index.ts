import type { AgentCode } from "@zeus/agents";

export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const TASK_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "review",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PLAN_STATUSES = ["draft", "active", "paused", "completed", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const MEMORY_TYPES = [
  "goal",
  "decision",
  "fact",
  "preference",
  "constraint",
  "project_context",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const CONVERSATION_TYPES = ["direct_agent", "team", "system"] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export const ARTIFACT_TYPES = [
  "document",
  "code",
  "report",
  "image",
  "dataset",
  "spreadsheet",
  "presentation",
  "link",
  "other",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export type AgentPresence =
  "idle" | "thinking" | "working" | "waiting" | "blocked" | "completed" | "offline";

export type WorkspaceCapability =
  | "workspace.read"
  | "workspace.manage"
  | "member.manage"
  | "task.read"
  | "task.write"
  | "plan.read"
  | "plan.write"
  | "conversation.read"
  | "conversation.write"
  | "file.read"
  | "file.write"
  | "artifact.read"
  | "artifact.write"
  | "memory.read"
  | "memory.write"
  | "activity.read";

const viewerCapabilities: readonly WorkspaceCapability[] = [
  "workspace.read",
  "task.read",
  "plan.read",
  "conversation.read",
  "file.read",
  "artifact.read",
  "memory.read",
  "activity.read",
];
const memberCapabilities: readonly WorkspaceCapability[] = [
  ...viewerCapabilities,
  "task.write",
  "plan.write",
  "conversation.write",
  "file.write",
  "artifact.write",
  "memory.write",
];
const adminCapabilities: readonly WorkspaceCapability[] = [
  ...memberCapabilities,
  "workspace.manage",
  "member.manage",
];

export function capabilitiesForRole(role: WorkspaceRole): ReadonlySet<WorkspaceCapability> {
  switch (role) {
    case "owner":
    case "admin":
      return new Set(adminCapabilities);
    case "member":
      return new Set(memberCapabilities);
    case "viewer":
      return new Set(viewerCapabilities);
  }
}

export function can(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
  return capabilitiesForRole(role).has(capability);
}

const taskTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ["ready", "cancelled"],
  ready: ["backlog", "in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "review", "completed", "cancelled"],
  blocked: ["ready", "in_progress", "cancelled"],
  review: ["in_progress", "blocked", "completed", "cancelled"],
  completed: ["in_progress"],
  cancelled: ["backlog"],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || taskTransitions[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) throw new Error(`Invalid task transition: ${from} -> ${to}`);
}

export function isMemoryType(value: string): value is MemoryType {
  return (MEMORY_TYPES as readonly string[]).includes(value);
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function isArtifactType(value: string): value is ArtifactType {
  return (ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function normalizeSequence<T extends { sequence: number }>(steps: readonly T[]): T[] {
  return [...steps].sort((a, b) => a.sequence - b.sequence);
}

export interface PresenceRun {
  readonly status: string;
  readonly createdAt: Date;
  readonly completedAt?: Date | null;
}

export function deriveAgentPresence(run: PresenceRun | undefined, now = new Date()): AgentPresence {
  if (!run) return "idle";
  switch (run.status) {
    case "queued":
      return "thinking";
    case "running":
      return "working";
    case "waiting":
      return "waiting";
    case "failed":
      return "blocked";
    case "completed": {
      const completedAt = run.completedAt ?? run.createdAt;
      return now.getTime() - completedAt.getTime() <= 15 * 60_000 ? "completed" : "idle";
    }
    case "cancelled":
      return "idle";
    default:
      return "offline";
  }
}

export const MAX_INLINE_FILE_BYTES = 1_048_576;
const blockedUploadExtensions = new Set([
  "exe",
  "dll",
  "com",
  "bat",
  "cmd",
  "msi",
  "scr",
  "apk",
  "dmg",
  "pkg",
]);
const blockedMimeTypes = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/vnd.microsoft.portable-executable",
]);

export function safeFileName(input: string): string {
  const normalized = input.normalize("NFKC").trim();
  if (!normalized || normalized.length > 180) throw new Error("Invalid filename.");
  if (normalized.includes("/") || normalized.includes("\\") || normalized.includes("\0")) {
    throw new Error("Invalid filename.");
  }
  if (normalized === "." || normalized === ".." || normalized.startsWith(".")) {
    throw new Error("Hidden or traversal filenames are not allowed.");
  }
  const extension = normalized.includes(".")
    ? (normalized.split(".").pop()?.toLowerCase() ?? "")
    : "";
  if (blockedUploadExtensions.has(extension))
    throw new Error("Executable uploads are not allowed.");
  return normalized;
}

export function validateUpload(input: {
  filename: string;
  contentType: string;
  size: number;
}): string {
  const filename = safeFileName(input.filename);
  if (!Number.isSafeInteger(input.size) || input.size < 0 || input.size > MAX_INLINE_FILE_BYTES) {
    throw new Error(`Files must be at most ${MAX_INLINE_FILE_BYTES} bytes.`);
  }
  const contentType = input.contentType.trim().toLowerCase();
  if (!contentType || contentType.length > 200 || blockedMimeTypes.has(contentType)) {
    throw new Error("Unsupported file type.");
  }
  return filename;
}

export function fileStorageKey(workspaceId: string, fileId: string): string {
  if (!/^[0-9a-f-]{36}$/iu.test(workspaceId) || !/^[0-9a-f-]{36}$/iu.test(fileId)) {
    throw new Error("Invalid storage identity.");
  }
  return `workspace/${workspaceId}/files/${fileId}`;
}

export function normalizeSearchQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, 120);
}

export interface WorkspaceContextSnapshot {
  readonly workspaceId: string;
  readonly objective: string;
  readonly successCriteria: string;
  readonly currentFocus: string;
  readonly activePlan?: {
    readonly id: string;
    readonly title: string;
    readonly objective: string;
  };
  readonly assignedTasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly status: TaskStatus;
    readonly assignedAgent: AgentCode | null;
  }[];
  readonly importantMemory: readonly {
    readonly id: string;
    readonly type: MemoryType;
    readonly title: string;
    readonly content: string;
  }[];
  readonly recentDecisions: readonly {
    readonly id: string;
    readonly title: string;
    readonly content: string;
  }[];
  readonly relevantFiles: readonly {
    readonly id: string;
    readonly filename: string;
    readonly contentType: string;
  }[];
}

export interface WorkspaceContextRepository {
  getWorkspaceContext(workspaceId: string): Promise<WorkspaceContextSnapshot>;
}

export interface TaskRepository {
  getTask(taskId: string): Promise<unknown>;
}
export interface PlanRepository {
  getPlan(planId: string): Promise<unknown>;
}
export interface ArtifactRepository {
  getArtifact(artifactId: string): Promise<unknown>;
}
export interface MemoryRepository {
  getMemory(memoryId: string): Promise<unknown>;
}
export interface RunRepository {
  getRun(runId: string): Promise<unknown>;
}
export interface ConnectionRegistry {
  getConnection(connectionId: string): Promise<unknown>;
}
export interface AgentRegistry {
  getAgent(code: AgentCode): Promise<unknown>;
}
