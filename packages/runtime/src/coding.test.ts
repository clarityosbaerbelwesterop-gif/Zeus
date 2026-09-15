import { describe, expect, it } from "vitest";
import { RuntimeError } from "./index";
import { KAI_CODING_POLICY, assertCompletion, authorizeCommand, safeWorkspacePath } from "./coding";

describe("Kai coding guardrails", () => {
  it("keeps file access workspace relative", () => {
    expect(safeWorkspacePath("src/app.ts")).toBe("src/app.ts");
    expect(() => safeWorkspacePath("../secret")).toThrow(RuntimeError);
    expect(() => safeWorkspacePath("/etc/passwd")).toThrow(RuntimeError);
  });

  it("blocks privileged commands and caps command duration", () => {
    expect(() => authorizeCommand({ argv: ["sudo", "rm", "-rf", "/"] })).toThrow(RuntimeError);
    expect(authorizeCommand({ argv: ["pnpm", "test"], timeoutMs: 999_999 }).timeoutMs).toBe(
      KAI_CODING_POLICY.maxCommandMs,
    );
  });

  it("refuses completion without required evidence", () => {
    expect(() =>
      assertCompletion(KAI_CODING_POLICY, [
        { requirementId: "tests", passed: true, safeDetail: "passed" },
        { requirementId: "typecheck", passed: true, safeDetail: "passed" },
      ]),
    ).toThrowError(/diff_review/);

    expect(() =>
      assertCompletion(KAI_CODING_POLICY, [
        { requirementId: "tests", passed: true, safeDetail: "passed" },
        { requirementId: "typecheck", passed: true, safeDetail: "passed" },
        { requirementId: "diff_review", passed: true, safeDetail: "reviewed" },
      ]),
    ).not.toThrow();
  });
});
