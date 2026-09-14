import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../packages/db/migrations/0001_foundation.sql", import.meta.url);
const clientUrl = new URL("../packages/db/src/client.ts", import.meta.url);
const tenantTables = [
  "users",
  "organizations",
  "organization_members",
  "workspaces",
  "workspace_members",
  "workspace_agents",
  "conversations",
  "messages",
  "runs",
  "run_steps",
  "artifacts",
  "connections",
  "api_tokens",
  "audit_events",
];

describe("Zeus database foundation", () => {
  it("forces row-level security on every tenant-owned table", async () => {
    const [sql, client] = await Promise.all([
      readFile(migrationUrl, "utf8"),
      readFile(clientUrl, "utf8"),
    ]);
    for (const table of tenantTables) {
      expect(sql).toContain(`ALTER TABLE zeus.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE zeus.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(sql).toContain("CREATE ROLE zeus_app NOLOGIN NOSUPERUSER");
    expect(client).toContain('await client.query("SET LOCAL ROLE zeus_app")');
    expect(client).toContain("set_config('zeus.user_id', $1, true)");
  });

  it("stores only opaque token identification and digests", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const tokenTable = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS zeus.api_tokens"),
      sql.indexOf("CREATE TABLE IF NOT EXISTS zeus.audit_events"),
    );
    expect(tokenTable).toContain("digest text NOT NULL UNIQUE");
    expect(tokenTable).toContain("prefix text NOT NULL");
    expect(tokenTable).not.toMatch(/raw_token|token_value|bearer_secret/iu);
  });
});
