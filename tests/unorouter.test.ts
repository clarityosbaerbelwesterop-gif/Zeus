import { describe, expect, it, vi } from "vitest";
import { createUnoRouterProvider } from "../packages/runtime/src/unorouter";

const input = {
  system: "Be concise.",
  messages: [{ role: "user" as const, content: "hello" }],
};

describe("UnoRouter provider", () => {
  it("uses the documented UnoRouter endpoint and never needs OpenRouter", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.unorouter.com/v1/chat/completions");
      return new Response(
        JSON.stringify({ model: "test-model", choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      model: "test-model",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const output = await provider.generate(input, new AbortController().signal);
    expect(output.provider).toBe("unorouter");
    expect(output.text).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back once on 429 without retrying malformed/auth failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "fallback" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "test-model",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect((await provider.generate(input, new AbortController().signal)).text).toBe("fallback");
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const authFetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const authProvider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "test-model",
      fetchImpl: authFetch as typeof fetch,
    });
    await expect(authProvider.generate(input, new AbortController().signal)).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
    });
    expect(authFetch).toHaveBeenCalledTimes(1);
  });
});
