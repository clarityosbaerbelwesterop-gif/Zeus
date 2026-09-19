import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseFormValueCents } from "../apps/web/lib/crm-copy.ts";

const vendorPattern = /n8n|salesforce|hubspot|studio canvas|mission control canvas/iu;

describe("CRM UI wiring", () => {
  it("does not invent a parallel deals schema or run authority", async () => {
    expect(
      existsSync(new URL("../packages/db/migrations/0013_crm_deals.sql", import.meta.url)),
    ).toBe(true);
    expect(existsSync(new URL("../packages/db/migrations/0013_deals.sql", import.meta.url))).toBe(
      false,
    );
    const schema = await readFile(new URL("../packages/db/src/schema.ts", import.meta.url), "utf8");
    expect(schema).toContain('zeus.table("deals"');
    expect(schema).not.toMatch(/deal_runs|deal_contacts|deal_missions/u);
    expect(schema).toContain("Deal-Room is conversation_id");
    expect(schema).toContain("Agent-Runs stay on zeus.runs / plan_steps");
  });

  it("wires Pipeline, Deal-Room and Agent-Runs to the live Deal APIs", async () => {
    const pipeline = await readFile(
      new URL("../apps/web/components/workspace-pipeline.tsx", import.meta.url),
      "utf8",
    );
    const room = await readFile(
      new URL("../apps/web/components/workspace-deal-room.tsx", import.meta.url),
      "utf8",
    );
    const runs = await readFile(
      new URL("../apps/web/components/workspace-agent-runs.tsx", import.meta.url),
      "utf8",
    );
    const actions = await readFile(
      new URL("../apps/web/app/app/actions.ts", import.meta.url),
      "utf8",
    );
    const product = await readFile(new URL("../apps/web/lib/product.ts", import.meta.url), "utf8");
    const runtime = await readFile(
      new URL("../apps/web/lib/agent-runtime.ts", import.meta.url),
      "utf8",
    );
    expect(pipeline).toContain("createDealAction");
    expect(pipeline).toContain("updateDealStageAction");
    expect(pipeline).toContain("DEAL_STAGES");
    expect(room).toContain("AgentRunsPanel");
    expect(room).toContain("data.dealApprovals");
    expect(runs).toContain("startDealAgentRunAction");
    expect(runs).toContain("run.conversationId === deal.conversationId");
    expect(actions).toContain("createDeal(");
    expect(actions).toContain("updateDealStage(");
    expect(actions).toContain("startDealAgentRun(");
    expect(product).toContain("sendDealThreadMessage");
    expect(runtime).toContain('type: "conversation_run"');
    expect(runtime).toContain("`deal:${dealId}:${prepared.messageId}`");
    expect(runtime).not.toMatch(/insert\(dealRuns\)|deal_runs/u);
  });

  it("keeps the CRM surface calm and free of vendor names", async () => {
    const files = [
      "../apps/web/components/workspace-pipeline.tsx",
      "../apps/web/components/workspace-deal-room.tsx",
      "../apps/web/components/workspace-agent-runs.tsx",
      "../apps/web/lib/crm-copy.ts",
      "../apps/web/components/app-shell.tsx",
    ];
    for (const file of files) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(vendorPattern);
    }
    const copy = await readFile(new URL("../apps/web/lib/crm-copy.ts", import.meta.url), "utf8");
    expect(copy).toContain("pipelineTitle");
    expect(copy).toContain("dealRoomEyebrow");
    expect(copy).toContain("agentRunsEyebrow");
  });

  it("parses deal form values as integer cents", () => {
    expect(parseFormValueCents("")).toBeNull();
    expect(parseFormValueCents("12.500")).toBe(1250000);
    expect(parseFormValueCents("12500,50")).toBe(1_250_050);
    expect(parseFormValueCents("18.50")).toBe(1850);
    expect(() => parseFormValueCents("nope")).toThrow(/Invalid deal value/);
  });
});
