import {
  AGENT_RUNTIME_POLICIES,
  AGENT_TEMPLATES,
  agentTemplate,
} from "../packages/agents/src/index.js";
import { describe, expect, it } from "vitest";

describe("canonical Zeus agents", () => {
  it("contains exactly the five system teammates in operating order", () => {
    expect(AGENT_TEMPLATES.map((agent) => agent.code)).toEqual([
      "kai",
      "lora",
      "jorge",
      "simon",
      "sara",
    ]);
    expect(new Set(AGENT_TEMPLATES.map((agent) => agent.name)).size).toBe(5);
  });

  it("keeps the V1 role authority stable", () => {
    expect(agentTemplate("kai")?.role).toBe("Management / Orchestration");
    expect(agentTemplate("lora")?.role).toBe("Engineering");
    expect(agentTemplate("jorge")?.role).toBe("Design / Product");
    expect(agentTemplate("simon")?.role).toBe("QA / Research / Verification");
    expect(agentTemplate("sara")?.role).toBe("Growth / Sales / Operations");
  });

  it("gives repository execution only to the engineering agent", () => {
    expect(AGENT_RUNTIME_POLICIES.lora.allowedTools).toContain("repo.run_quality_gate");
    expect(AGENT_RUNTIME_POLICIES.lora.completionRequirement?.toolId).toBe("repo.complete");
    for (const code of ["kai", "jorge", "simon", "sara"] as const) {
      expect(AGENT_RUNTIME_POLICIES[code].allowedTools).not.toContain("repo.run_command");
      expect(AGENT_RUNTIME_POLICIES[code].deniedTools).toContain("repo.run_command");
    }
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
