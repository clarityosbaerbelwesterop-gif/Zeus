import { AGENT_TEMPLATES, agentTemplate } from "../packages/agents/src/index.js";
import { describe, expect, it } from "vitest";

describe("canonical Zeus agents", () => {
  it("contains exactly the five system teammates", () => {
    expect(AGENT_TEMPLATES.map((agent) => agent.code)).toEqual([
      "jorge",
      "kai",
      "lora",
      "simon",
      "sara",
    ]);
    expect(new Set(AGENT_TEMPLATES.map((agent) => agent.name)).size).toBe(5);
  });

  it("keeps each agent purposeful and visually distinct", () => {
    for (const agent of AGENT_TEMPLATES) {
      expect(agent.responsibilities.length).toBeGreaterThanOrEqual(6);
      expect(agent.purpose.length).toBeGreaterThan(20);
      expect(agent.accent).toMatch(/^#[0-9a-f]{6}$/iu);
      expect(agentTemplate(agent.code)).toEqual(agent);
    }
  });
});
