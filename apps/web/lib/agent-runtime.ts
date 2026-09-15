import { randomUUID } from "node:crypto";
import { agentRuntimePolicy, type AgentCode } from "@zeus/agents";
import { requireSession } from "@zeus/auth/server";
import {
  artifacts,
  createDatabase,
  eq,
  runEvents,
  runs,
  runSteps,
  toolCalls,
  verificationResults,
  workspaceMemories,
} from "@zeus/db";
import {
  AgentRuntime,
  InMemoryProviderAdapter,
  ToolRegistry,
  type ApprovalRequestRecord,
  type ArtifactRecord,
  type CreateRunInput,
  type CreateStepInput,
  type MemoryRecord,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamEvent,
  type ProviderAdapter,
  type ProviderError,
  type RunEventRecord,
  type RunRecord,
  type RunRepository,
  type RunStepRecord,
  type RuntimeContext,
  type ToolCallRecord,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
  type UpdateRunInput,
  type UpdateStepInput,
  type VerificationResultRecord,
} from "@zeus/runtime";
import { env } from "@zeus/shared";
import { and, desc, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "./workspace-access";
import { workspaceHref } from "./workspace-navigation";

const database = createDatabase(env.DATABASE_URL);

const runtimeAgentCodes: AgentCode[] = ["kai", "jorge", "lora", "simon", "sara"];
const runtimeStatuses = [
  "queued",
  "preparing",
  "running",
  "waiting",
  "verifying",
  "paused",
  "needs_user_input",
  "needs_authorization",
  "completed",
  "failed",
  "cancelled",
] as const;

type RuntimeStatus = (typeof runtimeStatuses)[number];
type DbRun = typeof runs.$inferSelect;
type DbStep = typeof runSteps.$inferSelect;
type DbToolCall = typeof toolCalls.$inferSelect;
type DbRunEvent = typeof runEvents.$inferSelect;
type DbVerification = typeof verificationResults.$inferSelect;

function isAgentCode(value: string): value is AgentCode {
  return runtimeAgentCodes.includes(value as AgentCode);
}

function asAgentCode(value: string): AgentCode {
  return isAgentCode(value) ? value : "jorge";
}

function asRuntimeStatus(value: string): RuntimeStatus {
  return runtimeStatuses.includes(value as RuntimeStatus) ? (value as RuntimeStatus) : "failed";
}

function metadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null
    ) {
      safe[key] = entry;
    }
  }
  return safe;
}

function date(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function toRun(row: DbRun): RunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    taskId: row.taskId,
    agentCode: asAgentCode(row.agentCode),
    runType: row.runType as RunRecord["runType"],
    objective: row.objective,
    status: asRuntimeStatus(row.status),
    modelProvider: row.modelProvider,
    modelName: row.modelName,
    idempotencyKey: row.idempotencyKey,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: date(row.leaseExpiresAt),
    cancellationRequestedAt: date(row.cancellationRequestedAt),
    startedAt: date(row.startedAt),
    completedAt: date(row.completedAt),
    failedAt: date(row.failedAt),
    cancelledAt: date(row.cancelledAt),
    errorCode: row.errorCode,
    safeErrorMessage: row.safeErrorMessage,
    finalSummary: row.finalSummary,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    estimatedCostUsd: row.estimatedCostUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toStep(row: DbStep): RunStepRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    runId: row.runId,
    parentStepId: row.parentStepId,
    stepKey: row.stepKey,
    sequence: row.sequence,
    kind: row.kind as RunStepRecord["kind"],
    title: row.title,
    status: row.status as RunStepRecord["status"],
    sideEffectLevel: row.sideEffectLevel,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    idempotencyKey: row.idempotencyKey,
    startedAt: date(row.startedAt),
    completedAt: date(row.completedAt),
    failedAt: date(row.failedAt),
    cancelledAt: date(row.cancelledAt),
    errorCode: row.errorCode,
    safeDetail: row.safeDetail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toToolCall(row: DbToolCall): ToolCallRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    runId: row.runId,
    runStepId: row.runStepId,
    toolName: row.toolName,
    sideEffectLevel: row.sideEffectLevel,
    status: row.status as ToolCallRecord["status"],
    idempotencyKey: row.idempotencyKey,
    inputSummary: row.inputSummary,
    outputSummary: row.outputSummary,
    errorCode: row.errorCode,
    safeErrorMessage: row.safeErrorMessage,
    startedAt: date(row.startedAt),
    completedAt: date(row.completedAt),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvent(row: DbRunEvent): RunEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    runId: row.runId,
    runStepId: row.runStepId,
    toolCallId: row.toolCallId,
    eventType: row.eventType,
    safeMessage: row.safeMessage,
    metadata: metadata(row.metadata),
    createdAt: row.createdAt,
  };
}

function toVerification(row: DbVerification): VerificationResultRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    runId: row.runId,
    runStepId: row.runStepId,
    checkName: row.checkName,
    status: row.status as VerificationResultRecord["status"],
    safeDetail: row.safeDetail,
    evidenceArtifactId: row.evidenceArtifactId,
    createdAt: row.createdAt,
  };
}

class PostgresRunRepository implements RunRepository {
  async createRun(input: CreateRunInput): Promise<RunRecord> {
    const [row] = await database
      .insert(runs)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId ?? null,
        taskId: input.taskId ?? null,
        agentCode: input.agentCode,
        runType: input.runType,
        objective: input.objective,
        status: input.status ?? "queued",
        modelProvider: input.modelProvider ?? null,
        modelName: input.modelName ?? null,
        idempotencyKey: input.idempotencyKey,
        maxAttempts: input.maxAttempts ?? 3,
      })
      .returning();
    if (!row) throw new Error("RUN_CREATE_FAILED");
    return toRun(row);
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const [row] = await database.select().from(runs).where(eq(runs.id, runId)).limit(1);
    return row ? toRun(row) : null;
  }

  async findRunByIdempotencyKey(
    organizationId: string,
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<RunRecord | null> {
    const [row] = await database
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, organizationId),
          eq(runs.workspaceId, workspaceId),
          eq(runs.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row ? toRun(row) : null;
  }

  async updateRun(runId: string, input: UpdateRunInput): Promise<RunRecord> {
    const [row] = await database
      .update(runs)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
        ...(input.modelName !== undefined ? { modelName: input.modelName } : {}),
        ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
        ...(input.leaseOwner !== undefined ? { leaseOwner: input.leaseOwner } : {}),
        ...(input.leaseExpiresAt !== undefined ? { leaseExpiresAt: input.leaseExpiresAt } : {}),
        ...(input.cancellationRequestedAt !== undefined
          ? { cancellationRequestedAt: input.cancellationRequestedAt }
          : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        ...(input.failedAt !== undefined ? { failedAt: input.failedAt } : {}),
        ...(input.cancelledAt !== undefined ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
        ...(input.safeErrorMessage !== undefined
          ? { safeErrorMessage: input.safeErrorMessage }
          : {}),
        ...(input.finalSummary !== undefined ? { finalSummary: input.finalSummary } : {}),
        ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
        ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
        ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
        ...(input.estimatedCostUsd !== undefined
          ? { estimatedCostUsd: input.estimatedCostUsd }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(runs.id, runId))
      .returning();
    if (!row) throw new Error("RUN_NOT_FOUND");
    return toRun(row);
  }

  async compareAndSetRunStatus(
    runId: string,
    from: RunRecord["status"][],
    to: RunRecord["status"],
    patch: Omit<UpdateRunInput, "status"> = {},
  ): Promise<RunRecord | null> {
    const [row] = await database
      .update(runs)
      .set({
        status: to,
        ...(patch.modelProvider !== undefined ? { modelProvider: patch.modelProvider } : {}),
        ...(patch.modelName !== undefined ? { modelName: patch.modelName } : {}),
        ...(patch.attempt !== undefined ? { attempt: patch.attempt } : {}),
        ...(patch.leaseOwner !== undefined ? { leaseOwner: patch.leaseOwner } : {}),
        ...(patch.leaseExpiresAt !== undefined ? { leaseExpiresAt: patch.leaseExpiresAt } : {}),
        ...(patch.cancellationRequestedAt !== undefined
          ? { cancellationRequestedAt: patch.cancellationRequestedAt }
          : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch.failedAt !== undefined ? { failedAt: patch.failedAt } : {}),
        ...(patch.cancelledAt !== undefined ? { cancelledAt: patch.cancelledAt } : {}),
        ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
        ...(patch.safeErrorMessage !== undefined
          ? { safeErrorMessage: patch.safeErrorMessage }
          : {}),
        ...(patch.finalSummary !== undefined ? { finalSummary: patch.finalSummary } : {}),
        ...(patch.inputTokens !== undefined ? { inputTokens: patch.inputTokens } : {}),
        ...(patch.outputTokens !== undefined ? { outputTokens: patch.outputTokens } : {}),
        ...(patch.totalTokens !== undefined ? { totalTokens: patch.totalTokens } : {}),
        ...(patch.estimatedCostUsd !== undefined
          ? { estimatedCostUsd: patch.estimatedCostUsd }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, runId), inArray(runs.status, from)))
      .returning();
    return row ? toRun(row) : null;
  }

  async createStep(input: CreateStepInput): Promise<RunStepRecord> {
    const [row] = await database
      .insert(runSteps)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        runId: input.runId,
        parentStepId: input.parentStepId ?? null,
        stepKey: input.stepKey,
        sequence: input.sequence,
        kind: input.kind,
        title: input.title,
        status: input.status ?? "pending",
        sideEffectLevel: input.sideEffectLevel ?? 0,
        idempotencyKey: input.idempotencyKey,
        maxAttempts: input.maxAttempts ?? 3,
      })
      .returning();
    if (!row) throw new Error("STEP_CREATE_FAILED");
    return toStep(row);
  }

  async getStep(stepId: string): Promise<RunStepRecord | null> {
    const [row] = await database.select().from(runSteps).where(eq(runSteps.id, stepId)).limit(1);
    return row ? toStep(row) : null;
  }

  async listSteps(runId: string): Promise<RunStepRecord[]> {
    const rows = await database
      .select()
      .from(runSteps)
      .where(eq(runSteps.runId, runId))
      .orderBy(runSteps.sequence);
    return rows.map(toStep);
  }

  async updateStep(stepId: string, input: UpdateStepInput): Promise<RunStepRecord> {
    const [row] = await database
      .update(runSteps)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        ...(input.failedAt !== undefined ? { failedAt: input.failedAt } : {}),
        ...(input.cancelledAt !== undefined ? { cancelledAt: input.cancelledAt } : {}),
        ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
        ...(input.safeDetail !== undefined ? { safeDetail: input.safeDetail } : {}),
        updatedAt: new Date(),
      })
      .where(eq(runSteps.id, stepId))
      .returning();
    if (!row) throw new Error("STEP_NOT_FOUND");
    return toStep(row);
  }

  async compareAndSetStepStatus(
    stepId: string,
    from: RunStepRecord["status"][],
    to: RunStepRecord["status"],
    patch: Omit<UpdateStepInput, "status"> = {},
  ): Promise<RunStepRecord | null> {
    const [row] = await database
      .update(runSteps)
      .set({
        status: to,
        ...(patch.attempt !== undefined ? { attempt: patch.attempt } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch.failedAt !== undefined ? { failedAt: patch.failedAt } : {}),
        ...(patch.cancelledAt !== undefined ? { cancelledAt: patch.cancelledAt } : {}),
        ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
        ...(patch.safeDetail !== undefined ? { safeDetail: patch.safeDetail } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(runSteps.id, stepId), inArray(runSteps.status, from)))
      .returning();
    return row ? toStep(row) : null;
  }

  async appendEvent(input: Omit<RunEventRecord, "id" | "createdAt">): Promise<RunEventRecord> {
    const [row] = await database
      .insert(runEvents)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        runId: input.runId,
        runStepId: input.runStepId ?? null,
        toolCallId: input.toolCallId ?? null,
        eventType: input.eventType,
        safeMessage: input.safeMessage,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!row) throw new Error("EVENT_CREATE_FAILED");
    return toEvent(row);
  }

  async listEvents(runId: string): Promise<RunEventRecord[]> {
    const rows = await database
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(runEvents.createdAt);
    return rows.map(toEvent);
  }

  async createToolCall(
    input: Omit<ToolCallRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<ToolCallRecord> {
    const [row] = await database
      .insert(toolCalls)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        runId: input.runId,
        runStepId: input.runStepId,
        toolName: input.toolName,
        sideEffectLevel: input.sideEffectLevel,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        inputSummary: input.inputSummary,
        outputSummary: input.outputSummary,
        errorCode: input.errorCode,
        safeErrorMessage: input.safeErrorMessage,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      })
      .returning();
    if (!row) throw new Error("TOOL_CALL_CREATE_FAILED");
    return toToolCall(row);
  }

  async getToolCall(toolCallId: string): Promise<ToolCallRecord | null> {
    const [row] = await database
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.id, toolCallId))
      .limit(1);
    return row ? toToolCall(row) : null;
  }

  async findToolCallByIdempotencyKey(
    runId: string,
    idempotencyKey: string,
  ): Promise<ToolCallRecord | null> {
    const [row] = await database
      .select()
      .from(toolCalls)
      .where(and(eq(toolCalls.runId, runId), eq(toolCalls.idempotencyKey, idempotencyKey)))
      .limit(1);
    return row ? toToolCall(row) : null;
  }

  async updateToolCall(
    toolCallId: string,
    input: Partial<
      Pick<
        ToolCallRecord,
        | "status"
        | "outputSummary"
        | "errorCode"
        | "safeErrorMessage"
        | "startedAt"
        | "completedAt"
      >
    >,
  ): Promise<ToolCallRecord> {
    const [row] = await database
      .update(toolCalls)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(toolCalls.id, toolCallId))
      .returning();
    if (!row) throw new Error("TOOL_CALL_NOT_FOUND");
    return toToolCall(row);
  }

  async createVerificationResult(
    input: Omit<VerificationResultRecord, "id" | "createdAt">,
  ): Promise<VerificationResultRecord> {
    const [row] = await database
      .insert(verificationResults)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        runId: input.runId,
        runStepId: input.runStepId,
        checkName: input.checkName,
        status: input.status,
        safeDetail: input.safeDetail,
        evidenceArtifactId: input.evidenceArtifactId,
      })
      .returning();
    if (!row) throw new Error("VERIFICATION_CREATE_FAILED");
    return toVerification(row);
  }

  async listVerificationResults(runId: string): Promise<VerificationResultRecord[]> {
    const rows = await database
      .select()
      .from(verificationResults)
      .where(eq(verificationResults.runId, runId))
      .orderBy(verificationResults.createdAt);
    return rows.map(toVerification);
  }

  async createApprovalRequest(
    input: Omit<ApprovalRequestRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<ApprovalRequestRecord> {
    const [row] = await database.execute(sql<{
      id: string;
      organization_id: string;
      workspace_id: string;
      run_id: string;
      run_step_id: string;
      tool_call_id: string | null;
      action_type: string;
      side_effect_level: number;
      status: string;
      safe_summary: string;
      requested_by: string;
      resolved_by: string | null;
      resolved_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>`
      insert into approval_requests (
        organization_id, workspace_id, run_id, run_step_id, tool_call_id,
        action_type, side_effect_level, status, safe_summary, requested_by,
        resolved_by, resolved_at
      ) values (
        ${input.organizationId}::uuid, ${input.workspaceId}::uuid, ${input.runId}::uuid,
        ${input.runStepId}::uuid, ${input.toolCallId}::uuid, ${input.actionType},
        ${input.sideEffectLevel}, ${input.status}, ${input.safeSummary}, ${input.requestedBy}::uuid,
        ${input.resolvedBy}::uuid, ${input.resolvedAt}
      )
      returning *
    `);
    if (!row) throw new Error("APPROVAL_CREATE_FAILED");
    return {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      runId: row.run_id,
      runStepId: row.run_step_id,
      toolCallId: row.tool_call_id,
      actionType: row.action_type,
      sideEffectLevel: row.side_effect_level,
      status: row.status as ApprovalRequestRecord["status"],
      safeSummary: row.safe_summary,
      requestedBy: row.requested_by,
      resolvedBy: row.resolved_by,
      resolvedAt: date(row.resolved_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getApprovalRequest(approvalId: string): Promise<ApprovalRequestRecord | null> {
    const [row] = await database.execute(sql<{
      id: string;
      organization_id: string;
      workspace_id: string;
      run_id: string;
      run_step_id: string;
      tool_call_id: string | null;
      action_type: string;
      side_effect_level: number;
      status: string;
      safe_summary: string;
      requested_by: string;
      resolved_by: string | null;
      resolved_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>`
      select * from approval_requests where id = ${approvalId}::uuid limit 1
    `);
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      runId: row.run_id,
      runStepId: row.run_step_id,
      toolCallId: row.tool_call_id,
      actionType: row.action_type,
      sideEffectLevel: row.side_effect_level,
      status: row.status as ApprovalRequestRecord["status"],
      safeSummary: row.safe_summary,
      requestedBy: row.requested_by,
      resolvedBy: row.resolved_by,
      resolvedAt: date(row.resolved_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async resolveApprovalRequest(
    approvalId: string,
    input: {
      status: "approved" | "denied" | "expired" | "cancelled";
      resolvedBy: string;
      resolvedAt: Date;
    },
  ): Promise<ApprovalRequestRecord> {
    const [row] = await database.execute(sql<{
      id: string;
      organization_id: string;
      workspace_id: string;
      run_id: string;
      run_step_id: string;
      tool_call_id: string | null;
      action_type: string;
      side_effect_level: number;
      status: string;
      safe_summary: string;
      requested_by: string;
      resolved_by: string | null;
      resolved_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>`
      update approval_requests
      set status = ${input.status}, resolved_by = ${input.resolvedBy}::uuid,
          resolved_at = ${input.resolvedAt}, updated_at = now()
      where id = ${approvalId}::uuid
      returning *
    `);
    if (!row) throw new Error("APPROVAL_NOT_FOUND");
    return {
      id: row.id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      runId: row.run_id,
      runStepId: row.run_step_id,
      toolCallId: row.tool_call_id,
      actionType: row.action_type,
      sideEffectLevel: row.side_effect_level,
      status: row.status as ApprovalRequestRecord["status"],
      safeSummary: row.safe_summary,
      requestedBy: row.requested_by,
      resolvedBy: row.resolved_by,
      resolvedAt: date(row.resolved_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createArtifact(
    input: Omit<ArtifactRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<ArtifactRecord> {
    const [row] = await database
      .insert(artifacts)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        taskId: input.taskId,
        runId: input.runId,
        createdBy: input.createdBy,
        artifactType: input.artifactType,
        title: input.title,
        mimeType: input.mimeType,
        storageKind: input.storageKind,
        inlineContent: input.inlineContent,
        storageKey: input.storageKey,
        byteSize: input.byteSize,
        contentHash: input.contentHash,
        version: input.version,
        metadata: input.metadata,
      })
      .returning();
    if (!row) throw new Error("ARTIFACT_CREATE_FAILED");
    return {
      id: row.id,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      conversationId: row.conversationId,
      taskId: row.taskId,
      runId: row.runId,
      createdBy: row.createdBy,
      artifactType: row.artifactType,
      title: row.title,
      mimeType: row.mimeType,
      storageKind: row.storageKind,
      inlineContent: row.inlineContent,
      storageKey: row.storageKey,
      byteSize: row.byteSize,
      contentHash: row.contentHash,
      version: row.version,
      metadata: metadata(row.metadata),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listMemories(organizationId: string, workspaceId: string): Promise<MemoryRecord[]> {
    const rows = await database
      .select()
      .from(workspaceMemories)
      .where(
        and(
          eq(workspaceMemories.organizationId, organizationId),
          eq(workspaceMemories.workspaceId, workspaceId),
          eq(workspaceMemories.status, "active"),
        ),
      )
      .orderBy(desc(workspaceMemories.updatedAt))
      .limit(25);
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      kind: row.kind,
      content: row.content,
      priority: row.priority,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async acquireLease(runId: string, owner: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const [row] = await database
      .update(runs)
      .set({ leaseOwner: owner, leaseExpiresAt: expiresAt, updatedAt: now })
      .where(
        and(
          eq(runs.id, runId),
          or(isNull(runs.leaseExpiresAt), lt(runs.leaseExpiresAt, now), eq(runs.leaseOwner, owner)),
        ),
      )
      .returning({ id: runs.id });
    return Boolean(row);
  }

  async renewLease(runId: string, owner: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const [row] = await database
      .update(runs)
      .set({ leaseExpiresAt: new Date(now.getTime() + ttlMs), updatedAt: now })
      .where(and(eq(runs.id, runId), eq(runs.leaseOwner, owner)))
      .returning({ id: runs.id });
    return Boolean(row);
  }

  async releaseLease(runId: string, owner: string): Promise<void> {
    await database
      .update(runs)
      .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.leaseOwner, owner)));
  }
}

class NotConfiguredProvider implements ProviderAdapter {
  readonly providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  isConfigured(): boolean {
    return false;
  }

  async complete(_request: ModelRequest): Promise<ModelResponse> {
    const error = new Error(`Provider ${this.providerName} is not configured.`) as ProviderError;
    error.code = "PROVIDER_NOT_CONFIGURED";
    error.retryable = false;
    throw error;
  }

  async *stream(_request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    yield { type: "error", code: "PROVIDER_NOT_CONFIGURED", message: "Provider not configured." };
  }
}

function provider(): ProviderAdapter {
  if (env.NODE_ENV === "test") {
    return new InMemoryProviderAdapter("test-provider", {
      text: "Test runtime completed.",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  }
  return new NotConfiguredProvider("openai");
}

const toolRegistry = new ToolRegistry();

function registerInternalTool(definition: ToolDefinition) {
  if (!toolRegistry.has(definition.name)) toolRegistry.register(definition);
}

registerInternalTool({
  name: "workspace.memory.list",
  description: "List active workspace memories available to the current run.",
  sideEffectLevel: 0,
  inputSchema: { type: "object", additionalProperties: false },
  execute: async (_input: unknown, context: ToolExecutionContext): Promise<ToolResult> => {
    const rows = await database
      .select({ id: workspaceMemories.id, kind: workspaceMemories.kind, content: workspaceMemories.content })
      .from(workspaceMemories)
      .where(
        and(
          eq(workspaceMemories.organizationId, context.organizationId),
          eq(workspaceMemories.workspaceId, context.workspaceId),
          eq(workspaceMemories.status, "active"),
        ),
      )
      .limit(20);
    return {
      ok: true,
      output: rows,
      safeSummary: `${rows.length} workspace memories available.`,
    };
  },
});

registerInternalTool({
  name: "workspace.artifact.create_note",
  description: "Create a bounded text note artifact in the current workspace.",
  sideEffectLevel: 1,
  inputSchema: {
    type: "object",
    required: ["title", "content"],
    properties: { title: { type: "string" }, content: { type: "string" } },
    additionalProperties: false,
  },
  execute: async (input: unknown, context: ToolExecutionContext): Promise<ToolResult> => {
    const value = input as { title?: unknown; content?: unknown };
    if (typeof value.title !== "string" || typeof value.content !== "string") {
      return { ok: false, errorCode: "INVALID_INPUT", safeErrorMessage: "A title and content are required." };
    }
    const content = value.content.slice(0, 20_000);
    const [row] = await database
      .insert(artifacts)
      .values({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        runId: context.runId,
        createdBy: context.actorUserId,
        artifactType: "note",
        title: value.title.slice(0, 180),
        mimeType: "text/markdown",
        storageKind: "inline",
        inlineContent: content,
        byteSize: Buffer.byteLength(content, "utf8"),
        version: 1,
        metadata: { source: "runtime" },
      })
      .returning({ id: artifacts.id });
    return {
      ok: Boolean(row),
      output: row ?? null,
      safeSummary: row ? "Workspace note artifact created." : "Artifact creation failed.",
    };
  },
});

export const runRepository = new PostgresRunRepository();

export const agentRuntime = new AgentRuntime({
  repository: runRepository,
  provider: provider(),
  tools: toolRegistry,
  policyForAgent: (agentCode) => agentRuntimePolicy(asAgentCode(agentCode)),
  contextAssembler: async (run): Promise<RuntimeContext> => {
    const memories = await runRepository.listMemories(run.organizationId, run.workspaceId);
    return {
      systemPolicy: agentRuntimePolicy(asAgentCode(run.agentCode)).systemPolicy,
      workspaceObjective: run.objective,
      taskObjective: run.taskId ? run.objective : null,
      conversationSummary: run.conversationId ? run.objective : null,
      memories: memories.map((memory) => memory.content).slice(0, 12),
      availableTools: toolRegistry.list().map((tool) => tool.name),
    };
  },
  verifier: async ({ run, repository }) => {
    const events = await repository.listEvents(run.id);
    const failures = events.filter((event) => event.eventType.endsWith(".failed"));
    return [
      {
        checkName: "runtime_execution",
        status: failures.length ? "failed" : "passed",
        safeDetail: failures.length
          ? `${failures.length} execution failure event(s) require attention.`
          : "Runtime completed without a recorded execution failure.",
      },
    ];
  },
});

export async function startRuntimeRun(input: {
  workspaceId: string;
  objective: string;
  agentCode: string;
  runType: RunRecord["runType"];
  conversationId?: string | null;
  taskId?: string | null;
  idempotencyKey?: string;
}) {
  const { session, workspace } = await requireWorkspaceAccess(input.workspaceId);
  const agentCode = asAgentCode(input.agentCode);
  const idempotencyKey =
    input.idempotencyKey ?? `${input.runType}:${input.workspaceId}:${input.taskId ?? input.conversationId ?? randomUUID()}`;
  const run = await agentRuntime.createRun({
    organizationId: workspace.organizationId,
    workspaceId: workspace.id,
    conversationId: input.conversationId,
    taskId: input.taskId,
    agentCode,
    runType: input.runType,
    objective: input.objective,
    idempotencyKey,
    maxAttempts: 3,
  });
  await agentRuntime.executeRun(run.id, session.user.id);
  return runRepository.getRun(run.id);
}

export async function cancelRuntimeRun(runId: string) {
  const session = await requireSession();
  const run = await runRepository.getRun(runId);
  if (!run) throw new Error("RUN_NOT_FOUND");
  await requireWorkspaceAccess(run.workspaceId);
  return agentRuntime.requestCancellation(run.id, session.user.id);
}

export async function retryRuntimeRun(runId: string) {
  const session = await requireSession();
  const previous = await runRepository.getRun(runId);
  if (!previous) throw new Error("RUN_NOT_FOUND");
  await requireWorkspaceAccess(previous.workspaceId);
  if (previous.status !== "failed" && previous.status !== "cancelled") {
    throw new Error("RUN_NOT_RETRYABLE");
  }
  const retry = await agentRuntime.createRun({
    organizationId: previous.organizationId,
    workspaceId: previous.workspaceId,
    conversationId: previous.conversationId,
    taskId: previous.taskId,
    agentCode: previous.agentCode,
    runType: previous.runType,
    objective: previous.objective,
    idempotencyKey: `${previous.idempotencyKey}:retry:${previous.attempt + 1}`,
    maxAttempts: previous.maxAttempts,
  });
  await agentRuntime.executeRun(retry.id, session.user.id);
  return retry;
}

export async function getRunEvidence(runId: string) {
  const run = await runRepository.getRun(runId);
  if (!run) throw new Error("RUN_NOT_FOUND");
  await requireWorkspaceAccess(run.workspaceId);
  const [steps, events, verification] = await Promise.all([
    runRepository.listSteps(run.id),
    runRepository.listEvents(run.id),
    runRepository.listVerificationResults(run.id),
  ]);
  const tools = await database
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.runId, run.id))
    .orderBy(toolCalls.createdAt);
  return {
    run: {
      id: run.id,
      objective: run.objective,
      status: run.status,
      type: run.runType,
      agent: run.agentCode,
      finalSummary: run.finalSummary,
      safeErrorMessage: run.safeErrorMessage,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    },
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      status: step.status,
      safeDetail: step.safeDetail,
      createdAt: step.createdAt,
      updatedAt: step.updatedAt,
    })),
    tools: tools.map((tool) => ({
      id: tool.id,
      name: tool.toolName,
      status: tool.status,
      sideEffectLevel: tool.sideEffectLevel,
      inputSummary: tool.inputSummary,
      outputSummary: tool.outputSummary,
      safeErrorMessage: tool.safeErrorMessage,
      createdAt: tool.createdAt,
    })),
    verification,
    events,
  };
}

export async function stopRunAndRedirect(input: {
  runId: string;
  workspaceId: string;
  conversationId?: string | null;
  view?: string | null;
}) {
  await cancelRuntimeRun(input.runId);
  redirect(
    workspaceHref(input.workspaceId, {
      conversationId: input.conversationId,
      view: input.view ?? "runs",
      runId: input.runId,
    }),
  );
}

export async function retryRunAndRedirect(input: {
  runId: string;
  workspaceId: string;
  conversationId?: string | null;
  view?: string | null;
}) {
  const run = await retryRuntimeRun(input.runId);
  redirect(
    workspaceHref(input.workspaceId, {
      conversationId: input.conversationId,
      view: input.view ?? "runs",
      runId: run.id,
    }),
  );
}
