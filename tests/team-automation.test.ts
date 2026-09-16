import { describe, expect, it } from "vitest";
import {
  automationMayPerformSideEffect,
  nextAutomationRun,
  readyTeamTasks,
  safeHandoff,
  validateTeamTaskGraph,
  type TeamTask,
} from "../packages/runtime/src/team-automation";

const tasks: readonly TeamTask[] = [
  { id: "kai-build", agent: "kai", dependsOn: [] },
  { id: "lora-review", agent: "lora", dependsOn: [] },
  { id: "simon-verify", agent: "simon", dependsOn: ["kai-build"] },
  { id: "jorge-integrate", agent: "jorge", dependsOn: ["lora-review", "simon-verify"] },
];

describe("M6 TeamRun and M8 automation policy", () => {
  it("validates a bounded DAG and exposes only dependency-ready parallel work", () => {
    expect(() => validateTeamTaskGraph(tasks)).not.toThrow();
    expect(readyTeamTasks(tasks, new Set(), new Set(), 2).map((task) => task.id)).toEqual([
      "kai-build",
      "lora-review",
    ]);
    expect(
      readyTeamTasks(tasks, new Set(["kai-build"]), new Set(["lora-review"]), 2).map(
        (task) => task.id,
      ),
    ).toEqual(["simon-verify"]);
  });

  it("rejects cycles, duplicate delegation and unbounded rework", () => {
    expect(() =>
      validateTeamTaskGraph([
        { id: "a", agent: "kai", dependsOn: ["b"] },
        { id: "b", agent: "simon", dependsOn: ["a"] },
      ]),
    ).toThrow(/cycle/iu);
    expect(() =>
      validateTeamTaskGraph([
        { id: "a", agent: "kai", dependsOn: [] },
        { id: "a", agent: "simon", dependsOn: [] },
      ]),
    ).toThrow(/duplicate/iu);
    expect(() =>
      validateTeamTaskGraph([{ id: "a", agent: "kai", dependsOn: [], reworkCount: 3 }]),
    ).toThrow(/rework/iu);
  });

  it("creates explicit safe handoffs without policy escalation", () => {
    const handoff = safeHandoff({
      from: "kai",
      to: "simon",
      summary: "Implementation ready for deterministic verification.",
      evidence: { commit: "abc123", tests: "pass" },
      openQuestions: ["Check tenant denial."],
    });
    expect(handoff.to).toBe("simon");
    expect(() => safeHandoff({ from: "kai", to: "kai", summary: "self" })).toThrow();
  });

  it("enforces sane automation frequency and preserves approval boundaries", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    expect(nextAutomationRun({ type: "recurring", intervalMinutes: 60 }, now)?.toISOString()).toBe(
      "2026-09-15T13:00:00.000Z",
    );
    expect(() =>
      nextAutomationRun({ type: "condition_watch", intervalMinutes: 15 }, now),
    ).toThrow();
    expect(automationMayPerformSideEffect(2)).toBe(true);
    expect(automationMayPerformSideEffect(3)).toBe(false);
    expect(automationMayPerformSideEffect(4)).toBe(false);
  });
});
