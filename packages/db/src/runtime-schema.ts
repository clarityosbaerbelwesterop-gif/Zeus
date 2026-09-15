import { integer, jsonb, numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  agentTemplates,
  conversations,
  organizations,
  planSteps,
  runs,
  runSteps,
  tasks,
  workspaces,
  zeus,
} from "./schema";

// Typed mappings for columns added to the existing M2 physical tables by migration 0005.
// These are not new authorities or tables; they let the M3 runtime persist its durable state
// without duplicating the canonical Workspace/Run models.
export const runtimeRuns = zeus.table("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  planStepId: uuid("plan_step_id").references(() => planSteps.id, { onDelete: "set null" }),
  parentRunId: uuid("parent_run_id"),
  retryOfRunId: uuid("retry_of_run_id"),
  agentCode: text("agent_code")
    .notNull()
    .references(() => agentTemplates.code),
  runType: text("run_type").notNull().default("conversation_run"),
  triggerType: text("trigger_type").notNull().default("user"),
  status: text("status").notNull(),
  objective: text("objective").notNull(),
  createdBy: text("created_by").notNull(),
  idempotencyKey: text("idempotency_key"),
  errorCode: text("error_code"),
  safeErrorDetail: text("safe_error_detail"),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  contextTrace: jsonb("context_trace").notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runtimeRunSteps = zeus.table("run_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  stepType: text("step_type").notNull().default("model"),
  status: text("status").notNull(),
  title: text("title").notNull(),
  tool: text("tool"),
  safeDetail: text("safe_detail"),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runtimeArtifacts = zeus.table("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  mimeType: text("mime_type"),
  storageKey: text("storage_key"),
  contentType: text("content_type"),
  contentText: text("content_text"),
  createdBy: text("created_by").notNull(),
  creatingAgent: text("creating_agent").references(() => agentTemplates.code),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runEvents = zeus.table("run_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  safePayload: jsonb("safe_payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const toolCalls = zeus.table("tool_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  runStepId: uuid("run_step_id").references(() => runSteps.id, { onDelete: "set null" }),
  invocationId: text("invocation_id").notNull(),
  toolId: text("tool_id").notNull(),
  sideEffectLevel: integer("side_effect_level").notNull(),
  status: text("status").notNull(),
  safeInputSummary: text("safe_input_summary").notNull().default(""),
  safeOutputSummary: text("safe_output_summary"),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verificationResults = zeus.table("verification_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  checkName: text("check_name").notNull(),
  safeDetail: text("safe_detail").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageRecords = zeus.table("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  agentCode: text("agent_code")
    .notNull()
    .references(() => agentTemplates.code),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cachedTokens: integer("cached_tokens"),
  estimatedCost: numeric("estimated_cost", { precision: 18, scale: 8 }),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvalRequests = zeus.table("approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  toolCallId: uuid("tool_call_id").references(() => toolCalls.id, { onDelete: "set null" }),
  riskLevel: integer("risk_level").notNull(),
  safeSummary: text("safe_summary").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
});
