import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { conversations, organizations, plans, users, workspaces, zeus } from "./schema";

export const companies = zeus.table("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mission: text("mission").notNull().default(""),
  description: text("description").notNull().default(""),
  product: text("product").notNull().default(""),
  targetCustomer: text("target_customer").notNull().default(""),
  positioning: text("positioning").notNull().default(""),
  goals: jsonb("goals").notNull().default([]),
  constraints: jsonb("constraints").notNull().default([]),
  brandContext: jsonb("brand_context").notNull().default({}),
  connectedServices: jsonb("connected_services").notNull().default([]),
  repositories: jsonb("repositories").notNull().default([]),
  deploymentProjects: jsonb("deployment_projects").notNull().default([]),
  currentMetrics: jsonb("current_metrics").notNull().default({}),
  operatingPlan: jsonb("operating_plan").notNull().default({}),
  backlog: jsonb("backlog").notNull().default([]),
  decisions: jsonb("decisions").notNull().default([]),
  status: text("status").notNull().default("planning"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
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
  title: text("title").notNull(),
  outcome: text("outcome").notNull(),
  status: text("status").notNull().default("draft"),
  approvalRequired: boolean("approval_required").notNull().default(true),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  idempotencyKey: text("idempotency_key").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skills = zeus.table("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  description: text("description").notNull(),
  triggerMetadata: jsonb("trigger_metadata").notNull().default({}),
  requiredTools: jsonb("required_tools").notNull().default([]),
  requiredPermissions: jsonb("required_permissions").notNull().default([]),
  inputSchema: jsonb("input_schema").notNull().default({}),
  outputSchema: jsonb("output_schema").notNull().default({}),
  trustLevel: text("trust_level").notNull().default("untrusted"),
  status: text("status").notNull().default("candidate"),
  sourceRepository: text("source_repository"),
  sourcePath: text("source_path"),
  sourceCommit: text("source_commit"),
  sourceLicense: text("source_license"),
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
  instructions: text("instructions").notNull(),
  validation: jsonb("validation").notNull().default({}),
  provenance: jsonb("provenance").notNull().default({}),
  ownerSource: text("owner_source").notNull(),
  testStatus: text("test_status").notNull().default("pending"),
  securityStatus: text("security_status").notNull().default("pending"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface MemoryV1Metadata {
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly confidence: number | null;
  readonly validationStatus: "candidate" | "validated" | "rejected";
  readonly ownerScope: "run" | "project" | "company" | "user" | "procedure" | "workspace";
  readonly runId: string | null;
  readonly taskId: string | null;
}

// Kept here as the canonical numeric bound used by validation code that constructs
// memory candidates before persistence.
export const memoryConfidence = doublePrecision("confidence");
