import { boolean, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations, organizations, plans, users, workspaces, zeus } from "./schema";

export const companies = zeus.table("companies", {
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
  name: text("name").notNull(),
  mission: text("mission").notNull(),
  description: text("description").notNull().default(""),
  product: text("product").notNull().default(""),
  targetCustomer: text("target_customer").notNull().default(""),
  positioning: text("positioning").notNull().default(""),
  goals: jsonb("goals").notNull().default([]),
  constraints: jsonb("constraints").notNull().default([]),
  brandContext: jsonb("brand_context").notNull().default({}),
  currentMetrics: jsonb("current_metrics").notNull().default({}),
  operatingPlan: jsonb("operating_plan").notNull().default({}),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const missions = zeus.table("missions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("draft"),
  planSnapshot: jsonb("plan_snapshot").notNull().default({}),
  outcome: jsonb("outcome").notNull().default({}),
  idempotencyKey: text("idempotency_key").notNull(),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skills = zeus.table("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sourceType: text("source_type").notNull(),
  trustLevel: text("trust_level").notNull().default("untrusted"),
  status: text("status").notNull().default("draft"),
  provenance: jsonb("provenance").notNull().default({}),
  owner: text("owner"),
  currentVersion: integer("current_version").notNull().default(1),
  enabled: boolean("enabled").notNull().default(false),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillVersions = zeus.table("skill_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  triggerMetadata: jsonb("trigger_metadata").notNull().default({}),
  requiredTools: jsonb("required_tools").notNull().default([]),
  requiredPermissions: jsonb("required_permissions").notNull().default([]),
  inputSchema: jsonb("input_schema").notNull().default({}),
  outputSchema: jsonb("output_schema").notNull().default({}),
  instructions: text("instructions").notNull(),
  validation: jsonb("validation").notNull().default({}),
  testStatus: text("test_status").notNull().default("untested"),
  securityStatus: text("security_status").notNull().default("pending"),
  revisionNote: text("revision_note").notNull().default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;
export type Mission = typeof missions.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type SkillVersion = typeof skillVersions.$inferSelect;
