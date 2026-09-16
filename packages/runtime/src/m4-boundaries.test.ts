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
  it("accepts any valid owner/repository while isolating work to zeus feature branches", () => {
    expect(validateRepositoryFullName("openai/openai-node")).toBe("openai/openai-node");
    expect(validateRepositoryFullName("customer/private-saas")).toBe("customer/private-saas");
    expect(validateRepositoryFullName("enterprise/large-monorepo")).toBe(
      "enterprise/large-monorepo",
    );
    expect(validateRepositoryFullName("clarityosbaerbelwesterop-gif/Zeus")).toBe(
      "clarityosbaerbelwesterop-gif/Zeus",
    );
    expect(validateBaseSha("a".repeat(40))).toBe("a".repeat(40));
    expect(validateFeatureBranch("zeus/m4-safe-work")).toBe("zeus/m4-safe-work");
    expect(validateFeatureBranch("zeus/kai/customer-task-42")).toBe(
      "zeus/kai/customer-task-42",
    );
    expect(() => validateFeatureBranch("main")).toThrow();
    expect(() => validateFeatureBranch("production")).toThrow();
    expect(() => validateBaseSha("main")).toThrow();
  });

  it("rejects malformed repository identities instead of hard-coding a Zeus repository", () => {
    expect(() => validateRepositoryFullName("Zeus")).toThrow();
    expect(() => validateRepositoryFullName("owner/repo/extra")).toThrow();
    expect(() => validateRepositoryFullName("https://github.com/owner/repo")).toThrow();
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