import {
  assertMissionTransition,
  buildApprovalEnvelope,
  canActivateSkill,
  classifyActionRisk,
  createMemoryCandidate,
  discoverSkills,
  narrowChildDelegation,
  requiresApproval,
  UnavailableExecutionBackend,
  validateMemoryCandidate,
  type SkillDescriptor,
} from "../packages/runtime/src/v1-control.js";
import { describe, expect, it } from "vitest";

describe("V1 mission governance", () => {
  it("allows deterministic mission progress and rejects impossible jumps", () => {
    expect(() => assertMissionTransition("draft", "planning")).not.toThrow();
    expect(() => assertMissionTransition("running", "verifying")).not.toThrow();
    expect(() => assertMissionTransition("completed", "running")).toThrow(/Illegal mission transition/u);
    expect(() => assertMissionTransition("draft", "completed")).toThrow(/Illegal mission transition/u);
  });

  it("requires approval for consequential actions even when medium risk is allowed", () => {
    expect(
      classifyActionRisk({
        action: "publish campaign",
        sideEffectLevel: 3,
        external: true,
        publishesPublicly: true,
      }),
    ).toBe("high");
    expect(
      requiresApproval(
        { action: "purchase service", sideEffectLevel: 3, spendsMoney: true },
        { mediumRiskAllowed: true, maximumAutomaticSideEffect: 3 },
      ),
    ).toBe(true);
    expect(
      requiresApproval(
        { action: "read workspace", sideEffectLevel: 0 },
        { mediumRiskAllowed: false, maximumAutomaticSideEffect: 1 },
      ),
    ).toBe(false);
  });

  it("builds complete approval envelopes", () => {
    expect(
      buildApprovalEnvelope(
        { action: "rotate credential", sideEffectLevel: 4, credentialMutation: true },
        {
          what: "Rotate the production credential",
          why: "Current credential is expiring",
          impact: "Provider requests may briefly fail during cutover",
          target: "production provider connection",
          agent: "Lora",
          rollbackPossible: true,
        },
      ),
    ).toMatchObject({ risk: "high", rollbackPossible: true });
  });
});

describe("V1 skills and memory", () => {
  const baseSkill: SkillDescriptor = {
    id: "skill-1",
    slug: "debugging",
    scope: "built_in",
    status: "active",
    trustLevel: "system",
    triggerKeywords: ["debug", "error"],
    requiredTools: ["repo.read_file"],
    requiredPermissions: ["repo.read"],
    testStatus: "passed",
    securityStatus: "passed",
  };

  it("uses progressive skill discovery with tool and permission filtering", () => {
    expect(
      discoverSkills([baseSkill], {
        taskText: "Debug the deployment error",
        availableTools: new Set(["repo.read_file"]),
        permissions: new Set(["repo.read"]),
      }).map((skill) => skill.slug),
    ).toEqual(["debugging"]);
    expect(
      discoverSkills([baseSkill], {
        taskText: "Debug the deployment error",
        availableTools: new Set(),
        permissions: new Set(["repo.read"]),
      }),
    ).toEqual([]);
  });

  it("never silently trusts generated skills", () => {
    expect(
      canActivateSkill({ ...baseSkill, scope: "generated", trustLevel: "untrusted" }),
    ).toBe(false);
    expect(
      canActivateSkill({ ...baseSkill, scope: "generated", trustLevel: "reviewed" }),
    ).toBe(true);
  });

  it("requires provenance before durable memory can be validated", () => {
    const candidate = createMemoryCandidate({
      title: "Release constraint",
      content: "Never publish without approval.",
      scope: "project",
      confidence: 1,
      provenance: { source: "workspace policy", observedAt: "2026-09-16T10:00:00Z" },
    });
    expect(candidate.validationStatus).toBe("candidate");
    expect(validateMemoryCandidate(candidate, "simon").validationStatus).toBe("validated");
    expect(() =>
      createMemoryCandidate({
        title: "Bad memory",
        content: "Unproven",
        scope: "project",
        confidence: 2,
        provenance: { source: "model", observedAt: "2026-09-16T10:00:00Z" },
      }),
    ).toThrow(/confidence/u);
  });
});

describe("V1 subagent and execution boundaries", () => {
  it("permits child narrowing and rejects privilege escalation", () => {
    const parent = {
      permissions: ["repo.read", "repo.write"],
      toolIds: ["repo.read_file", "repo.write_file"],
      budgetUnits: 100,
      maximumConcurrency: 3,
    } as const;
    expect(
      narrowChildDelegation(parent, {
        permissions: ["repo.read"],
        toolIds: ["repo.read_file"],
        budgetUnits: 20,
        maximumConcurrency: 1,
      }),
    ).toMatchObject({ budgetUnits: 20, maximumConcurrency: 1 });
    expect(() =>
      narrowChildDelegation(parent, {
        permissions: ["repo.read", "billing.spend"],
        toolIds: ["repo.read_file"],
        budgetUnits: 20,
        maximumConcurrency: 1,
      }),
    ).toThrow(/permission escalation/u);
  });

  it("fails closed when no isolated execution backend is verified", async () => {
    const backend = new UnavailableExecutionBackend();
    expect(await backend.isAvailable()).toBe(false);
    await expect(
      backend.execute(
        {
          workspaceId: "workspace",
          command: "echo",
          args: ["hello"],
          workingDirectory: "/workspace",
          limits: { timeoutMs: 1000, cpuUnits: 1, memoryMb: 128, network: "none" },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/No verified isolated execution backend/u);
  });
});
