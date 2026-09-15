import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../packages/db/migrations/0009_connected_apps_rls_repair.sql",
  import.meta.url,
);

describe("M5 database authority repair", () => {
  it("uses the canonical user actor setting and restores zeus_app grants", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).not.toContain("zeus.actor_id");
    expect(sql).toContain("zeus.current_user_id()");
    for (const table of [
      "workspace_connections",
      "credential_metadata",
      "oauth_states",
      "mcp_sessions",
      "external_operations",
    ]) {
      expect(sql).toMatch(new RegExp(`GRANT [^;]+ ON zeus\\.${table} TO zeus_app`, "u"));
    }
  });

  it("backfills and requires connection organization ownership", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("SET organization_id = w.organization_id");
    expect(sql).toContain("ALTER COLUMN organization_id SET NOT NULL");
  });
});
