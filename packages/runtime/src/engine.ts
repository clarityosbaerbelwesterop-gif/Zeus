import { createHash, randomUUID } from "node:crypto";
import { agentRuntimePolicy, type AgentCode } from "@zeus/agents";
import type { RunStatus, RunStepStatus } from "@zeus/shared";
import type { AssembledContext, SafeContextTrace } from "./context";
import {
  assertRuntimeBudgetWithinPolicy,
  assertRuntimeUsageTelemetry,
  type RuntimeUsageTotals,
} from "./budget";
import {
  DEFAULT_RUNTIME_POLICY,
  ProviderNotConfiguredError,
  RuntimeError,
  type ToolRegistry,
  assertRunTransition,
  retryDelayMs,
  shouldRetry,
  type ModelInput,
  type ModelMessage,
  type ModelOutput,
  type ModelProvider,
  type ModelUsage,
  type RunType,
  type RuntimeErrorCode,
  type RuntimePolicy,
  type ToolDefinition,
  type ToolExecutionContext,
} from "./index";

export interface RuntimeRun {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly agent: AgentCode;
  readonly objective: string;
  readonly type: RunType;
  readonly status: RunStatus;
  readonly conversationId?: string;
  readonly taskId?: string;
  readonly planStepId?: string;
  readonly retryOfRunId?: string;
  readonly parentRunId?: string;
}

export interface RuntimeStepInput {
  readonly type: string;
  readonly title: string;
  readonly status: RunStepStatus;
  readonly tool?: string;
  readonly safeDetail?: string;
}

export interface ToolCallEvidence {
  readonly id: string;
  readonly runId: string;
  readonly invocationId: string;
  readonly toolId: string;
  readonly status: string;
}

export interface VerificationEvidence {
  readonly status: "passed" | "failed" | "skipped";
  readonly checkName: string;
  readonly safeDetail: string;
}

export interface RuntimeStore {
  createRun(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly actorId: string;
    readonly agent: AgentCode;
    readonly objective: string;
    readonly type: RunType;
    readonly conversationId?: string;
    readonly taskId?: string;
    readonly planStepId?: string;
    readonly retryOfRunId?: string;
    readonly parentRunId?: string;
    readonly idempotencyKey: string;
    readonly triggerType: string;
  }): Promise<RuntimeRun>;
  createRetryRun(source: RuntimeRun, idempotencyKey: string): Promise<RuntimeRun>;
  getRun(runId: string): Promise<RuntimeRun | null>;
  transition(
    runId: string,
    from: RunStatus,
    to: RunStatus,
    safeReason?: string,
  ): Promise<RuntimeRun>;
  createStep(runId: string, input: RuntimeStepInput): Promise<{ readonly id: string }>;
  updateStep(
    stepId: string,
    status: RunStepStatus,
    input?: { readonly safeDetail?: string; readonly errorCode?: RuntimeErrorCode },
  ): Promise<void>;
  recordEvent(
    run: RuntimeRun,
    eventType: string,
    safePayload?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  setContextTrace(runId: string, trace: SafeContextTrace): Promise<void>;
  recordToolCall(input: {
    readonly run: RuntimeRun;
    readonly stepId: string;
    readonly invocationId: string;
    readonly tool: ToolDefinition;
    readonly safeInputSummary: string;
  }): Promise<ToolCallEvidence>;
  completeToolCall(
    evidence: ToolCallEvidence,
    input: {
      readonly status: "completed" | "failed" | "cancelled" | "waiting_authorization";
      readonly safeOutputSummary?: string;
      readonly errorCode?: RuntimeErrorCode;
    },
  ): Promise<void>;
  recordUsage(
    run: RuntimeRun,
    provider: string,
    model: string,
    usage?: ModelUsage,
  ): Promise<RuntimeUsageTotals>;
  recordVerification(run: RuntimeRun, evidence: VerificationEvidence): Promise<void>;
  persistFinalResponse(run: RuntimeRun, text: string): Promise<void>;
  acquireLease(runId: string, owner: string, ttlMs: number): Promise<boolean>;
  heartbeat(runId: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(runId: string, owner: string): Promise<void>;
  requestCancellation(runId: string, actorId: string): Promise<void>;
}

export interface RuntimeExecutionDependencies {
  readonly store: RuntimeStore;
  readonly provider: ModelProvider;
  readonly tools: ToolRegistry;
  readonly assembleContext: (run: RuntimeRun) => Promise<AssembledContext>;
  readonly authorizeTool: (run: RuntimeRun, tool: ToolDefinition) => void | Promise<void>;
  readonly verify: (
    run: RuntimeRun,
    input: { readonly finalText: string; readonly toolCalls: readonly ToolCallEvidence[] },
  ) => Promise<readonly VerificationEvidence[]>;
  readonly hasRequiredConnection?: (run: RuntimeRun, connection: string) => Promise<boolean>;
  readonly policy?: RuntimePolicy;
  readonly leaseTtlMs?: number;
}

export interface StartRunInput {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly agent: AgentCode;
  readonly objective: string;
  readonly type: RunType;
  readonly conversationId?: string;
  readonly taskId?: string;
  readonly planStepId?: string;
  readonly parentRunId?: string;
  readonly idempotencyKey: string;
  readonly triggerType?: string;
}

export interface ExecutionResult {
  readonly run: RuntimeRun;
  readonly finalText?: string;
  readonly verification: readonly VerificationEvidence[];
}

const activeControllers = new Map<string, AbortController>();
const terminalStatuses = new Set<RunStatus>(["completed", "failed", "cancelled"]);

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function safeJson(value: unknown, maxBytes: number): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = JSON.stringify({ value: "[unserializable tool result]" });
  }
  if (byteLength(text) <= maxBytes) return text;
  return JSON.stringify({ value: "[tool result truncated]" });
}

function toolSignature(toolId: string, input: unknown): string {
  return createHash("sha256")
    .update(`${toolId}:${safeJson(input, 32_000)}`)
    .digest("hex");
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new RuntimeError("RUN_CANCELLED", "Run cancelled."));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new RuntimeError("RUN_CANCELLED", "Run cancelled."));
      },
      { once: true },
    );
  });
}

async function generateWithRetry(
  provider: ModelProvider,
  input: ModelInput,
  signal: AbortSignal,
  run: RuntimeRun,
  store: RuntimeStore,
): Promise<ModelOutput> {
  if (!provider.configured) throw new ProviderNotConfiguredError();
  let attempt = 1;
  while (true) {
    try {
      return await provider.generate(input, signal);
    } catch (error) {
      const runtimeError =
        error instanceof RuntimeError
          ? error
          : new RuntimeError("MODEL_ERROR", "The model provider failed unexpectedly.", true);
      if (!shouldRetry(runtimeError, attempt)) throw runtimeError;
      await store.recordEvent(run, "model.retry", { attempt, errorCode: runtimeError.code });
      await delay(retryDelayMs(attempt), signal);
      attempt += 1;
    }
  }
}

function assertWithinExecutionLimits(
  startedAt: number,
  toolCallCount: number,
  policy: RuntimePolicy,
): void {
  if (Date.now() - startedAt > policy.maxDurationMs)
    throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Run duration limit exceeded.");
  if (toolCallCount > policy.maxToolCalls)
    throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Run tool-call limit exceeded.");
}

function abortSignals(parent: AbortSignal, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return AbortSignal.any([parent, timeout]);
}

async function executeTool(
  run: RuntimeRun,
  tool: ToolDefinition,
  rawInput: unknown,
  invocationId: string,
  stepId: string,
  dependencies: RuntimeExecutionDependencies,
  signal: AbortSignal,
): Promise<{ readonly evidence: ToolCallEvidence; readonly result: unknown }> {
  const policy = dependencies.policy ?? DEFAULT_RUNTIME_POLICY;
  const inputBytes = byteLength(safeJson(rawInput, policy.maxToolPayloadBytes + 1));
  if (inputBytes > policy.maxToolPayloadBytes)
    throw new RuntimeError("TOOL_INPUT_INVALID", "Tool payload exceeds the runtime limit.");
  const parsed = tool.parse(rawInput);
  const safeInputSummary = tool.summarizeInput(parsed).slice(0, 4_096);
  const evidence = await dependencies.store.recordToolCall({
    run,
    stepId,
    invocationId,
    tool,
    safeInputSummary,
  });
  await dependencies.store.recordEvent(run, "tool.requested", {
    toolId: tool.id,
    invocationId,
    sideEffectLevel: tool.sideEffect,
  });
  if (tool.requiredConnection && dependencies.hasRequiredConnection) {
    const connected = await dependencies.hasRequiredConnection(run, tool.requiredConnection);
    if (!connected) {
      await dependencies.store.completeToolCall(evidence, { status: "waiting_authorization" });
      throw new RuntimeError(
        "TOOL_PERMISSION_DENIED",
        `Required connection is unavailable for ${tool.id}.`,
      );
    }
  }
  await dependencies.authorizeTool(run, tool);
  await dependencies.store.recordEvent(run, "tool.started", { toolId: tool.id, invocationId });
  const context: ToolExecutionContext = {
    organizationId: run.organizationId,
    workspaceId: run.workspaceId,
    actorId: run.actorId,
    agent: run.agent,
    runId: run.id,
    invocationId,
    signal: abortSignals(signal, tool.timeoutMs),
  };
  try {
    const result = await tool.execute(parsed, context);
    const safeOutputSummary = tool.summarizeOutput(result).slice(0, 4_096);
    await dependencies.store.completeToolCall(evidence, { status: "completed", safeOutputSummary });
    await dependencies.store.recordEvent(run, "tool.completed", { toolId: tool.id, invocationId });
    return { evidence, result };
  } catch (error) {
    const runtimeError =
      error instanceof RuntimeError
        ? error
        : new RuntimeError("TOOL_EXECUTION_FAILED", `Tool ${tool.id} failed.`);
    await dependencies.store.completeToolCall(evidence, {
      status: signal.aborted ? "cancelled" : "failed",
      errorCode: runtimeError.code,
    });
    await dependencies.store.recordEvent(run, "tool.failed", {
      toolId: tool.id,
      invocationId,
      errorCode: runtimeError.code,
    });
    throw runtimeError;
  }
}

export async function startRun(input: StartRunInput, store: RuntimeStore): Promise<RuntimeRun> {
  const run = await store.createRun({ ...input, triggerType: input.triggerType ?? "user" });
  await store.recordEvent(run, "run.created", { type: run.type, agent: run.agent });
  return run;
}

export async function executeRun(
  runId: string,
  dependencies: RuntimeExecutionDependencies,
): Promise<ExecutionResult> {
  const run = await dependencies.store.getRun(runId);
  if (!run) throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Run not found.");
  if (terminalStatuses.has(run.status)) return { run, verification: [] };
  const policy = dependencies.policy ?? DEFAULT_RUNTIME_POLICY;
  const leaseTtlMs = dependencies.leaseTtlMs ?? 30_000;
  const leaseOwner = randomUUID();
  const acquired = await dependencies.store.acquireLease(run.id, leaseOwner, leaseTtlMs);
  if (!acquired) {
    throw new RuntimeError(
      "INTERNAL_RUNTIME_ERROR",
      "Run is already leased by another worker.",
      true,
    );
  }
  const controller = new AbortController();
  activeControllers.set(run.id, controller);
  const startedAt = Date.now();
  const executedToolCalls: ToolCallEvidence[] = [];
  let current = run;
  let activeStepId: string | undefined;
  try {
    if (current.status === "queued")
      current = await dependencies.store.transition(current.id, "queued", "preparing");
    else if (
      ["waiting", "paused", "needs_user_input", "needs_authorization"].includes(current.status)
    ) {
      current = await dependencies.store.transition(
        current.id,
        current.status,
        "running",
        "run.resumed",
      );
      await dependencies.store.recordEvent(current, "run.resumed");
    }
    if (current.status === "preparing") {
      await dependencies.store.recordEvent(current, "context.started");
      const step = await dependencies.store.createStep(current.id, {
        type: "context",
        title: "Prepare workspace context",
        status: "running",
      });
      activeStepId = step.id;
      const assembled = await dependencies.assembleContext(current);
      await dependencies.store.setContextTrace(current.id, assembled.trace);
      await dependencies.store.updateStep(step.id, "completed", {
        safeDetail: `Prepared ${assembled.trace.categoriesUsed.join(", ")} within the context budget.`,
      });
      activeStepId = undefined;
      await dependencies.store.recordEvent(current, "context.prepared", {
        categories: assembled.trace.categoriesUsed,
        approximateTokens: assembled.trace.approximateTokenEstimate,
      });
      current = await dependencies.store.transition(current.id, "preparing", "running");
      await dependencies.store.recordEvent(current, "run.started");
      const agentPolicy = agentRuntimePolicy(current.agent);
      const allowedTools = dependencies.tools
        .listFor(current.agent)
        .filter((tool) => agentPolicy.allowedTools.includes(tool.id));
      const modelTools = allowedTools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
      const messages: ModelMessage[] = [...assembled.messages];
      const repeated = new Map<string, number>();
      let toolCallCount = 0;
      let consecutiveFailures = 0;
      while (true) {
        assertWithinExecutionLimits(startedAt, toolCallCount, policy);
        if (controller.signal.aborted) throw new RuntimeError("RUN_CANCELLED", "Run cancelled.");
        await dependencies.store.heartbeat(current.id, leaseOwner, leaseTtlMs);
        const modelStep = await dependencies.store.createStep(current.id, {
          type: "model",
          title: "Generate agent response",
          status: "running",
        });
        activeStepId = modelStep.id;
        await dependencies.store.recordEvent(current, "model.started");
        const output = await generateWithRetry(
          dependencies.provider,
          { system: assembled.system, messages, tools: modelTools },
          controller.signal,
          current,
          dependencies.store,
        );
        assertRuntimeUsageTelemetry(output.usage, policy);
        const usageTotals = await dependencies.store.recordUsage(
          current,
          output.provider,
          output.model,
          output.usage,
        );
        assertRuntimeBudgetWithinPolicy(usageTotals, policy);
        await dependencies.store.updateStep(modelStep.id, "completed", {
          safeDetail: output.toolCalls?.length
            ? `Model requested ${output.toolCalls.length} tool call(s).`
            : "Model returned a final response.",
        });
        activeStepId = undefined;
        await dependencies.store.recordEvent(current, "model.completed", {
          provider: output.provider,
          model: output.model,
          toolCallCount: output.toolCalls?.length ?? 0,
        });
        if (output.toolCalls?.length) {
          messages.push({ role: "assistant", content: output.text, toolCalls: output.toolCalls });
          for (const call of output.toolCalls) {
            toolCallCount += 1;
            assertWithinExecutionLimits(startedAt, toolCallCount, policy);
            const tool = dependencies.tools.get(call.toolId);
            if (!tool || !allowedTools.some((candidate) => candidate.id === tool.id))
              throw new RuntimeError(
                "TOOL_PERMISSION_DENIED",
                "The requested tool is not allowed for this agent.",
              );
            const signature = toolSignature(tool.id, call.input);
            const count = (repeated.get(signature) ?? 0) + 1;
            repeated.set(signature, count);
            if (count > policy.maxRepeatedIdenticalToolCalls)
              throw new RuntimeError(
                "REPEATED_TOOL_CALL",
                "Repeated identical tool-call limit exceeded.",
              );
            const toolStep = await dependencies.store.createStep(current.id, {
              type: "tool",
              title: tool.name,
              status: "running",
              tool: tool.id,
            });
            activeStepId = toolStep.id;
            try {
              const executed = await executeTool(
                current,
                tool,
                call.input,
                call.id,
                toolStep.id,
                dependencies,
                controller.signal,
              );
              executedToolCalls.push(executed.evidence);
              messages.push({
                role: "tool",
                content: safeJson(executed.result, policy.maxToolPayloadBytes),
                toolCallId: call.id,
              });
              await dependencies.store.updateStep(toolStep.id, "completed", {
                safeDetail: `Completed ${tool.name}.`,
              });
              consecutiveFailures = 0;
            } catch (error) {
              consecutiveFailures += 1;
              const runtimeError =
                error instanceof RuntimeError
                  ? error
                  : new RuntimeError("TOOL_EXECUTION_FAILED", `Tool ${tool.id} failed.`);
              await dependencies.store.updateStep(toolStep.id, "failed", {
                safeDetail: runtimeError.message,
                errorCode: runtimeError.code,
              });
              if (consecutiveFailures >= policy.maxConsecutiveFailures)
                throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Consecutive failure limit exceeded.");
              throw runtimeError;
            } finally {
              activeStepId = undefined;
            }
          }
          continue;
        }
        if (byteLength(output.text) > policy.maxOutputBytes)
          throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Model output exceeds the runtime limit.");
        current = await dependencies.store.transition(current.id, "running", "verifying");
        await dependencies.store.recordEvent(current, "verification.started");
        const verificationStep = await dependencies.store.createStep(current.id, {
          type: "verification",
          title: "Verify persisted result",
          status: "running",
        });
        activeStepId = verificationStep.id;
        const verification = await dependencies.verify(current, {
          finalText: output.text,
          toolCalls: executedToolCalls,
        });
        for (const evidence of verification)
          await dependencies.store.recordVerification(current, evidence);
        const failed = verification.some((item) => item.status === "failed");
        await dependencies.store.updateStep(verificationStep.id, failed ? "failed" : "completed", {
          safeDetail: failed
            ? "Deterministic verification failed."
            : "Deterministic verification passed.",
        });
        activeStepId = undefined;
        await dependencies.store.recordEvent(current, "verification.completed", {
          status: failed ? "failed" : "passed",
          checks: verification.length,
        });
        if (failed)
          throw new RuntimeError("VERIFICATION_FAILED", "Deterministic verification failed.");
        await dependencies.store.persistFinalResponse(current, output.text);
        current = await dependencies.store.transition(current.id, "verifying", "completed");
        await dependencies.store.recordEvent(current, "run.completed");
        return { run: current, finalText: output.text, verification };
      }
    }
    throw new RuntimeError(
      "INTERNAL_RUNTIME_ERROR",
      `Run cannot execute from state ${current.status}.`,
    );
  } catch (error) {
    const runtimeError =
      error instanceof RuntimeError
        ? error
        : new RuntimeError("INTERNAL_RUNTIME_ERROR", "Run execution failed unexpectedly.");
    if (activeStepId)
      await dependencies.store
        .updateStep(activeStepId, controller.signal.aborted ? "cancelled" : "failed", {
          safeDetail: runtimeError.message,
          errorCode: runtimeError.code,
        })
        .catch(() => undefined);
    const target: RunStatus =
      controller.signal.aborted || runtimeError.code === "RUN_CANCELLED"
        ? "cancelled"
        : runtimeError.code === "PROVIDER_NOT_CONFIGURED"
          ? "waiting"
          : runtimeError.code === "TOOL_PERMISSION_DENIED"
            ? "needs_authorization"
            : "failed";
    if (!terminalStatuses.has(current.status) && current.status !== target) {
      try {
        assertRunTransition(current.status, target);
        current = await dependencies.store.transition(
          current.id,
          current.status,
          target,
          runtimeError.message,
        );
      } catch {
        /* preserve original failure */
      }
      await dependencies.store.recordEvent(
        current,
        target === "cancelled" ? "run.cancelled" : "run.failed",
        {
          errorCode: runtimeError.code,
        },
      );
    }
    throw runtimeError;
  } finally {
    activeControllers.delete(run.id);
    await dependencies.store.releaseLease(run.id, leaseOwner).catch(() => undefined);
  }
}

export async function cancelRun(
  runId: string,
  actorId: string,
  store: RuntimeStore,
): Promise<void> {
  await store.requestCancellation(runId, actorId);
  activeControllers.get(runId)?.abort();
}

export async function resumeRun(
  runId: string,
  dependencies: RuntimeExecutionDependencies,
): Promise<ExecutionResult> {
  return executeRun(runId, dependencies);
}

export async function retryRun(
  failedRunId: string,
  idempotencyKey: string,
  dependencies: RuntimeExecutionDependencies,
): Promise<RuntimeRun> {
  const source = await dependencies.store.getRun(failedRunId);
  if (!source) throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Run not found.");
  if (!new Set<RunStatus>(["failed", "cancelled"]).has(source.status)) {
    throw new RuntimeError(
      "INTERNAL_RUNTIME_ERROR",
      "Only failed or cancelled runs can be retried.",
    );
  }
  const retry = await dependencies.store.createRetryRun(source, idempotencyKey);
  await dependencies.store.recordEvent(retry, "run.created", { retryOfRunId: source.id });
  return retry;
}

export async function transitionRun(
  runId: string,
  from: RunStatus,
  to: RunStatus,
  store: RuntimeStore,
  safeReason?: string,
): Promise<RuntimeRun> {
  assertRunTransition(from, to);
  return store.transition(runId, from, to, safeReason);
}

export async function recordRunEvent(
  run: RuntimeRun,
  eventType: string,
  store: RuntimeStore,
  safePayload?: Readonly<Record<string, unknown>>,
): Promise<void> {
  await store.recordEvent(run, eventType, safePayload);
}

export async function completeRun(run: RuntimeRun, store: RuntimeStore): Promise<RuntimeRun> {
  assertRunTransition(run.status, "completed");
  return store.transition(run.id, run.status, "completed");
}

export async function failRun(
  run: RuntimeRun,
  store: RuntimeStore,
  error: RuntimeError,
): Promise<RuntimeRun> {
  assertRunTransition(run.status, "failed");
  const failed = await store.transition(run.id, run.status, "failed", error.message);
  await store.recordEvent(failed, "run.failed", { errorCode: error.code });
  return failed;
}
