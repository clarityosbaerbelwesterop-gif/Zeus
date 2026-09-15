import type { AgentCode } from "@zeus/agents";
import type { RunStatus, RunStepStatus } from "@zeus/shared";

export type RunType = "conversation_run" | "task_run" | "plan_step_run";
export type ToolSideEffect = 0 | 1 | 2 | 3 | 4;

export const RUNTIME_ERROR_CODES = [
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "MODEL_ERROR",
  "TOOL_NOT_FOUND",
  "TOOL_INPUT_INVALID",
  "TOOL_PERMISSION_DENIED",
  "TOOL_TIMEOUT",
  "TOOL_EXECUTION_FAILED",
  "WORKSPACE_ACCESS_DENIED",
  "RUN_CANCELLED",
  "RUN_LIMIT_EXCEEDED",
  "CONTEXT_ASSEMBLY_FAILED",
  "VERIFICATION_FAILED",
  "INTERNAL_RUNTIME_ERROR",
] as const;
export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export class RuntimeError extends Error {
  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}

export interface RuntimePolicy {
  readonly maxToolCalls: number;
  readonly maxDurationMs: number;
  readonly maxOutputBytes: number;
  readonly maxToolPayloadBytes: number;
  readonly maxConsecutiveFailures: number;
  readonly maxRepeatedToolCall: number;
  readonly maxRunTokens?: number;
  readonly maxEstimatedCost?: number;
}

export const DEFAULT_RUNTIME_POLICY: RuntimePolicy = Object.freeze({
  maxToolCalls: 24,
  maxDurationMs: 10 * 60_000,
  maxOutputBytes: 256_000,
  maxToolPayloadBytes: 64_000,
  maxConsecutiveFailures: 3,
  maxRepeatedToolCall: 2,
});

const runTransitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ["preparing", "cancelled"],
  preparing: ["running", "waiting", "failed", "cancelled"],
  running: [
    "waiting",
    "verifying",
    "failed",
    "cancelled",
    "paused",
    "needs_user_input",
    "needs_authorization",
  ],
  waiting: ["running", "failed", "cancelled", "paused"],
  verifying: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
  paused: ["running", "cancelled", "failed"],
  needs_user_input: ["running", "cancelled", "failed"],
  needs_authorization: ["running", "cancelled", "failed"],
};

const stepTransitions: Readonly<Record<RunStepStatus, readonly RunStepStatus[]>> = {
  pending: ["running", "skipped", "cancelled"],
  running: ["waiting", "completed", "failed", "cancelled"],
  waiting: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  skipped: [],
  cancelled: [],
};

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!runTransitions[from].includes(to)) {
    throw new RuntimeError(
      "INTERNAL_RUNTIME_ERROR",
      `Invalid run transition: ${from} -> ${to}`,
    );
  }
}

export function assertRunStepTransition(from: RunStepStatus, to: RunStepStatus): void {
  if (!stepTransitions[from].includes(to)) {
    throw new RuntimeError(
      "INTERNAL_RUNTIME_ERROR",
      `Invalid run step transition: ${from} -> ${to}`,
    );
  }
}

export interface ModelMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCallId?: string;
}

export interface ModelInput {
  readonly system: string;
  readonly messages: readonly ModelMessage[];
  readonly tools?: readonly ModelToolDescription[];
}

export interface ModelToolCall {
  readonly id: string;
  readonly toolId: string;
  readonly input: unknown;
}

export interface ModelUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cachedTokens?: number;
  readonly estimatedCost?: number;
}

export interface ModelOutput {
  readonly text: string;
  readonly toolCalls?: readonly ModelToolCall[];
  readonly provider: string;
  readonly model: string;
  readonly usage?: ModelUsage;
}

export interface ModelProvider {
  readonly id: string;
  readonly configured: boolean;
  readonly capabilities: ReadonlySet<
    "stream" | "tools" | "structured_output" | "usage" | "cancellation"
  >;
  generate(input: ModelInput, signal: AbortSignal): Promise<ModelOutput>;
}

export interface ModelToolDescription {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
}

export interface ToolExecutionContext {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly agent: AgentCode;
  readonly runId: string;
  readonly invocationId: string;
  readonly signal: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sideEffect: ToolSideEffect;
  readonly allowedAgents: readonly AgentCode[];
  readonly requiredConnection?: string;
  readonly timeoutMs: number;
  parse(input: unknown): TInput;
  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
  summarizeInput(input: TInput): string;
  summarizeOutput(output: TOutput): string;
}

export class ToolRegistry {
  readonly #tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.#tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.#tools.set(tool.id, tool);
  }

  get(toolId: string): ToolDefinition {
    const tool = this.#tools.get(toolId);
    if (!tool) {
      throw new RuntimeError("TOOL_NOT_FOUND", `Unknown tool: ${toolId}`);
    }
    return tool;
  }

  listFor(agent: AgentCode): readonly ToolDefinition[] {
    return [...this.#tools.values()].filter((tool) => tool.allowedAgents.includes(agent));
  }

  authorize(
    toolId: string,
    agent: AgentCode,
    maximumSideEffect: ToolSideEffect,
  ): ToolDefinition {
    const tool = this.get(toolId);
    if (!tool.allowedAgents.includes(agent) || tool.sideEffect > maximumSideEffect) {
      throw new RuntimeError(
        "TOOL_PERMISSION_DENIED",
        `Tool is not permitted for ${agent}.`,
      );
    }
    return tool;
  }
}

export interface RunRecorder {
  start(input: {
    organizationId: string;
    workspaceId: string;
    conversationId?: string;
    taskId?: string;
    planStepId?: string;
    agent: AgentCode;
    objective: string;
    type: RunType;
    idempotencyKey: string;
    retryOfRunId?: string;
    parentRunId?: string;
  }): Promise<{ id: string }>;
  transition(
    runId: string,
    from: RunStatus,
    to: RunStatus,
    safeReason?: string,
  ): Promise<void>;
  step(
    runId: string,
    input: { status: RunStepStatus; title: string; tool?: string; safeDetail?: string },
  ): Promise<{ id: string }>;
  event(
    runId: string,
    type: string,
    safePayload?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  finish(
    runId: string,
    status: Extract<RunStatus, "completed" | "failed" | "cancelled" | "waiting">,
    errorCode?: RuntimeErrorCode,
  ): Promise<void>;
}

export class ProviderNotConfiguredError extends RuntimeError {
  constructor() {
    super("PROVIDER_NOT_CONFIGURED", "AI provider is not configured yet.");
    this.name = "ProviderNotConfiguredError";
  }
}

export const unconfiguredProvider: ModelProvider = {
  id: "unconfigured",
  configured: false,
  capabilities: new Set(),
  generate() {
    return Promise.reject(new ProviderNotConfiguredError());
  },
};

export function shouldRetry(
  error: RuntimeError,
  attempt: number,
  maximumAttempts = 3,
): boolean {
  return error.retryable && attempt < maximumAttempts;
}

export function retryDelayMs(attempt: number, baseMs = 500, ceilingMs = 8_000): number {
  return Math.min(ceilingMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
