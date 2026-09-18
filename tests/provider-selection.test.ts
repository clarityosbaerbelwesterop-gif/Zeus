import { describe, expect, it } from "vitest";
import { createOpenRouterProviderFromEnv } from "../packages/runtime/src/openrouter";

describe("canonical provider selection", () => {
  it("prefers UnoRouter and its internal model defaults when canonical credentials are configured", () => {
    const provider = createOpenRouterProviderFromEnv({
      UNOROUTER_API_KEY_1: "uno-primary",
      OPENROUTER_API_KEY: "legacy-openrouter",
    });

    expect(provider.configured).toBe(true);
    expect(provider.id).toBe("unorouter");
    expect(provider.capabilities.has("tools")).toBe(true);
    expect(provider.capabilities.has("structured_output")).toBe(true);
  });

  it("keeps the legacy OpenRouter adapter only as an explicit fallback", () => {
    const provider = createOpenRouterProviderFromEnv({
      OPENROUTER_API_KEY: "legacy-openrouter",
      ZEUS_DEFAULT_MODEL: "legacy-model",
    });

    expect(provider.configured).toBe(true);
    expect(provider.id).toBe("openrouter");
  });

  it("uses Gemini OpenAI-compatible adapter when GEMINI_API_KEY is configured", () => {
    const provider = createOpenRouterProviderFromEnv({
      GEMINI_API_KEY: "gemini-key",
    });

    expect(provider.configured).toBe(true);
    expect(provider.id).toBe("openrouter");
  });
});
