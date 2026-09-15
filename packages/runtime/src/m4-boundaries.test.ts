import { describe, expect, it } from "vitest";
import {
  assertSafeRelativePath,
  classifyCommand,
  commandAllowed,
  completionRequirementSatisfied,
  truncateExecutionOutput,
  validateBaseSha,
  validateFeatureBranch,
  validateRepositoryFullName,
} from "./m4-boundaries";

describe("M4 Kai execution boundaries", () => {
  it("pins repositories and zeus feature branches", () => {
    expect(validateRepositoryFullName("openai/openai-node")).toBe("openai/openai-node");
    expect(validateBaseSha("a".repeat(40))).toBe("a".repeat(40));
    expect(validateFeatureBranch("zeus/m4-safe-work")).toBe("zeus/m4-safe-work");
    expect(() => validateFeatureBranch("main")).toThrow();
    expect(() => validateBaseSha("main")).toThrow();
  });

  it("contains repository paths", () => {
    expect(assertSafeRelativePath("src/index.ts")).toBe("src/index.ts");
    expect(() => assertSafeRelativePath("../secret")).toThrow();
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow();
  });

  it("classifies commands before sandbox dispatch", () => {
    expect(classifyCommand("git", ["status"])).toBe("read");
    expect(classifyCommand("pnpm", ["test"])).toBe("write");
    expect(classifyCommand("git", ["push", "origin", "x"])).toBe("network");
    expect(classifyCommand("sudo", ["sh"])).toBe("dangerous");
    expect(commandAllowed("read_only", "write")).toBe(false);
    expect(commandAllowed("supervised", "network")).toBe(false);
    expect(commandAllowed("autonomous", "network")).toBe(true);
    expect(commandAllowed("autonomous", "dangerous")).toBe(false);
  });

  it("requires completion evidence and bounds output", () => {
    const requirement = { toolId: "repo.complete", recoveryInstructions: "repair" };
    expect(completionRequirementSatisfied(requirement, ["repo.git_diff"])).toBe(false);
    expect(completionRequirementSatisfied(requirement, ["repo.complete"])).toBe(true);
    const result = truncateExecutionOutput("x".repeat(200), 64);
    expect(result.truncated).toBe(true);
    expect(new TextEncoder().encode(result.text).byteLength).toBeLessThanOrEqual(64);
  });
});
