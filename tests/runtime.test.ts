import {
  ProviderNotConfiguredError,
  unconfiguredProvider,
} from "../packages/runtime/src/index.js";
import { describe, expect, it } from "vitest";

describe("M1 provider boundary", () => {
  it("fails truthfully instead of fabricating agent output", async () => {
    expect(unconfiguredProvider.configured).toBe(false);
    await expect(
      unconfiguredProvider.generate(
        { system: "x", messages: [] },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});
