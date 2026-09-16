import { boolean, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agentTemplates, organizations, tasks, users, workspaces, zeus } from "./schema";
import { runtimeRuns } from "./runtime-schema";

export const teamRuns = zeus.table("team_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),
  status: text("status").notNull(),
  coordinatorAgent: text("coordinator_agent")
    .notNull()
    .default("jorge")
    .references(() => agentTemplates.code),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  maxParallel: integer("max_parallel").notNull().default(3),
  maxRework: integer("max_rework").notNull().default(2),
  idempotencyKey: text("idempotency_key").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamRunMembers = zeus.table("team_run_members", {
  teamRunId: uuid("team_run_id")
    .notNull()
    .references(() => teamRuns.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => runtimeRuns.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  agentCode: text("agent_code")
    .notNull()
    .references(() => agentTemplates.code),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskDependencies = zeus.table("task_dependencies", {
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  dependsOnTaskId: uuid("depends_on_task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const handoffs = zeus.table("handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  teamRunId: uuid("team_run_id")
    .notNull()
    .references(() => teamRuns.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  fromAgent: text("from_agent")
    .notNull()
    .references(() => agentTemplates.code),
  toAgent: text("to_agent")
    .notNull()
    .references(() => agentTemplates.code),
  summary: text("summary").notNull(),
  evidence: jsonb("evidence").notNull().default({}),
  openQuestions: jsonb("open_questions").notNull().default([]),
  reworkCount: integer("rework_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automations = zeus.table("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  instruction: text("instruction").notNull(),
  scheduleType: text("schedule_type").notNull(),
  scheduleDefinition: jsonb("schedule_definition").notNull(),
  agentCode: text("agent_code").references(() => agentTemplates.code),
  teamMode: boolean("team_mode").notNull().default(false),
  status: text("status").notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = zeus.table("automation_runs", {
  automationId: uuid("automation_id")
    .notNull()
    .references(() => automations.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runtimeRuns.id, { onDelete: "set null" }),
  teamRunId: uuid("team_run_id").references(() => teamRuns.id, { onDelete: "set null" }),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  triggerKey: text("trigger_key").notNull(),
  status: text("status").notNull(),
});
