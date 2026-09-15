import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { connections, organizations, runs, workspaces, zeus } from "./schema";

export const repositoryBindings = zeus.table("repository_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("github"),
  repositoryFullName: text("repository_full_name").notNull(),
  cloneUrl: text("clone_url").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  baseSha: text("base_sha").notNull(),
  featureBranch: text("feature_branch").notNull(),
  connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionSessions = zeus.table("execution_sessions", {
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
  repositoryBindingId: uuid("repository_binding_id")
    .notNull()
    .references(() => repositoryBindings.id, { onDelete: "cascade" }),
  sandboxProvider: text("sandbox_provider").notNull().default("vercel"),
  sandboxName: text("sandbox_name").notNull(),
  sandboxSessionId: text("sandbox_session_id").notNull(),
  status: text("status").notNull().default("active"),
  permissionMode: text("permission_mode").notNull().default("supervised"),
  rootPath: text("root_path").notNull(),
  baseSha: text("base_sha").notNull(),
  currentHeadSha: text("current_head_sha"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionCheckpoints = zeus.table("execution_checkpoints", {
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
  executionSessionId: uuid("execution_session_id")
    .notNull()
    .references(() => executionSessions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  headSha: text("head_sha").notNull(),
  worktreeSha: text("worktree_sha"),
  safeDiffSummary: text("safe_diff_summary").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repositoryChangeRequests = zeus.table("repository_change_requests", {
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
  repositoryBindingId: uuid("repository_binding_id")
    .notNull()
    .references(() => repositoryBindings.id, { onDelete: "cascade" }),
  operation: text("operation").notNull(),
  status: text("status").notNull().default("pending"),
  headBranch: text("head_branch").notNull(),
  baseBranch: text("base_branch").notNull(),
  expectedHeadSha: text("expected_head_sha").notNull(),
  safeTitle: text("safe_title"),
  safeBody: text("safe_body"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  externalNumber: integer("external_number"),
  externalUrl: text("external_url"),
  safeError: text("safe_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
