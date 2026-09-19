import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../packages/db/migrations/0013_crm_deals.sql", import.meta.url);
const schemaUrl = new URL("../packages/db/src/schema.ts", import.meta.url);

describe("CRM Deal domain schema", () => {
  it("adds a thin deals table with Deal-Room conversation and no new mission types", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const schema = await readFile(schemaUrl, "utf8");
    expect(sql).toContain("CREATE TABLE zeus.deals");
    expect(sql).toContain(
      "conversation_id uuid REFERENCES zeus.conversations(id) ON DELETE SET NULL",
    );
    expect(sql).toContain("deals_conversation_workspace");
    expect(sql).toContain("ALTER TABLE zeus.deals ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE zeus.deals FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY deals_select");
    expect(sql).toContain("CREATE POLICY deals_write");
    expect(sql).toContain("GRANT SELECT,INSERT,UPDATE,DELETE ON zeus.deals TO zeus_app");
    expect(sql).not.toMatch(/deal_mission|mission_type|CREATE TABLE zeus\.deal_runs/iu);
    expect(schema).toContain('zeus.table("deals"');
    expect(schema).toContain("conversationId");
    expect(schema).toContain("Deal-Room is conversation_id");
    expect(schema).toContain("Agent-Runs stay on zeus.runs / plan_steps");
  });

  it("keeps pipeline stage and optional value without inventing a second run authority", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("stage text NOT NULL DEFAULT 'lead'");
    expect(sql).toContain("value_cents integer");
    expect(sql).toContain("owner_user_id text NOT NULL REFERENCES zeus.users(id)");
    expect(sql).toContain("status text NOT NULL DEFAULT 'open'");
    expect(sql).not.toContain("CREATE TABLE zeus.missions");
    expect(sql).not.toMatch(/run_type|plan_step_run|conversation_run/iu);
  });
});
