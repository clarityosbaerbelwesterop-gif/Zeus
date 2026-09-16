import { describe, expect, it } from "vitest";
import { createOpenRouterProviderFromEnv } from "../packages/runtime/src/openrouter";

describe("canonical provider selection", () => {
  it("prefers UnoRouter when canonical Zeus credentials are configured", () => {
    const provider = createOpenRouterProviderFromEnv({
      UNOROUTER_API_KEY_1: "uno-primary",
      ZEUS_DEFAULT_MODEL: "canonical-model",
      OPENROUTER_API_KEY: "legacy-openrouter",
    });

    expect(provider.configured).toBe(true);
    expect(provider.id).toBe("unorouter");
  });

  it("keeps the legacy OpenRouter adapter only as an explicit fallback", () => {
    const provider = createOpenRouterProviderFromEnv({
      OPENROUTER_API_KEY: "legacy-openrouter",
      ZEUS_DEFAULT_MODEL: "legacy-model",
    });

    expect(provider.configured).toBe(true);
    expect(provider.id).toBe("openrouter");
  });
});
