import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration2Url = new URL("../packages/db/migrations/0002_workspace_os.sql", import.meta.url);
const migration3Url = new URL(
  "../packages/db/migrations/0003_workspace_collaboration_security.sql",
  import.meta.url,
);

const tenantTables = [
  "conversation_participants",
  "tasks",
  "task_conversations",
  "task_runs",
  "plans",
  "plan_steps",
  "files",
  "file_objects",
  "task_artifacts",
  "memory",
  "workspace_events",
] as const;

describe("PRODUCT M2 database contract", () => {
  it("adds one Workspace OS schema instead of duplicate M1 authorities", async () => {
    const sql = await readFile(migration2Url, "utf8");
    expect(sql).toContain("ALTER TABLE zeus.workspaces");
    expect(sql).toContain("ALTER TABLE zeus.conversations");
    expect(sql).toContain("ALTER TABLE zeus.messages");
    expect(sql).toContain("ALTER TABLE zeus.artifacts");
    expect(sql).not.toMatch(/workspace_v2|new_workspace|chat2|new_artifact_system/iu);
  });

  it("forces RLS on every new tenant-owned M2 table", async () => {
    const sql = await readFile(migration2Url, "utf8");
    for (const table of tenantTables) {
      expect(sql).toContain(`ALTER TABLE zeus.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE zeus.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(sql).toContain("CREATE OR REPLACE FUNCTION zeus.can_write_workspace");
    expect(sql).toContain("workspace_events_insert");
  });

  it("keeps security audit and user-facing activity as distinct persisted authorities", async () => {
    const sql = await readFile(migration2Url, "utf8");
    expect(sql).toContain("CREATE TABLE zeus.workspace_events");
    expect(sql).not.toContain("DROP TABLE zeus.audit_events");
    expect(sql).toContain("safe_payload jsonb");
  });

  it("adds bounded full-text search without a vector database", async () => {
    const sql = await readFile(migration2Url, "utf8");
    expect(sql).toContain("messages_search_idx");
    expect(sql).toContain("tasks_search_idx");
    expect(sql).toContain("memory_search_idx");
    expect(sql).toContain("USING gin(to_tsvector");
    expect(sql).not.toMatch(/vector|embedding|pgvector/iu);
  });

  it("keeps file objects bounded, isolated and non-executable by schema design", async () => {
    const sql = await readFile(migration2Url, "utf8");
    expect(sql).toContain("size integer NOT NULL CHECK(size BETWEEN 0 AND 1048576)");
    expect(sql).toContain("checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("file_objects_select");
    expect(sql).toContain("file_objects_write");
    expect(sql).not.toMatch(/execute_file|shell_command|filesystem_path/iu);
  });

  it("allows collaborator profile reads only through shared workspace membership", async () => {
    const sql = await readFile(migration3Url, "utf8");
    expect(sql).toContain("zeus.can_read_workspace_user");
    expect(sql).toContain("JOIN zeus.workspace_members theirs");
    expect(sql).toContain("CREATE POLICY users_select");
    expect(sql).toContain("CREATE POLICY users_update_self");
  });
});
