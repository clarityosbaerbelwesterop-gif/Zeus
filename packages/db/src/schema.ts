import { boolean, integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const zeus = pgSchema("zeus");
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = zeus.table("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  ...timestamps,
});

export const organizations = zeus.table("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  ...timestamps,
});

export const organizationMembers = zeus.table(
  "organization_members",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const workspaces = zeus.table("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdBy: text("created_by").notNull(),
  ...timestamps,
});

export const workspaceMembers = zeus.table(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const agentTemplates = zeus.table("agent_templates", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  purpose: text("purpose").notNull(),
  accent: text("accent").notNull(),
  responsibilities: jsonb("responsibilities").notNull(),
  systemOwned: boolean("system_owned").notNull().default(true),
});

export const workspaceAgents = zeus.table(
  "workspace_agents",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    agentCode: text("agent_code").notNull().references(() => agentTemplates.code),
    enabledBy: text("enabled_by").notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.agentCode] })],
);

export const conversations = zeus.table("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  agentCode: text("agent_code").references(() => agentTemplates.code),
  createdBy: text("created_by").notNull(),
  ...timestamps,
});

export const messages = zeus.table("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  authorId: text("author_id"),
  agentCode: text("agent_code").references(() => agentTemplates.code),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = zeus.table("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  agentCode: text("agent_code").notNull().references(() => agentTemplates.code),
  status: text("status").notNull(),
  objective: text("objective").notNull(),
  createdBy: text("created_by").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runSteps = zeus.table("run_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  tool: text("tool"),
  safeDetail: text("safe_detail"),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const artifacts = zeus.table("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  storageKey: text("storage_key"),
  contentType: text("content_type"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connections = zeus.table("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  scopes: jsonb("scopes").notNull().default([]),
  secretRef: text("secret_ref"),
  ...timestamps,
});

export const apiTokens = zeus.table("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  label: text("label").notNull(),
  prefix: text("prefix").notNull(),
  digest: text("digest").notNull(),
  scopes: jsonb("scopes").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const auditEvents = zeus.table("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
