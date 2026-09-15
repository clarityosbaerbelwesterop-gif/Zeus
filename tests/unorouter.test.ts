import { describe, expect, it, vi } from "vitest";
import { createUnoRouterProvider } from "../packages/runtime/src/unorouter";

const input = {
  system: "Be concise.",
  messages: [{ role: "user" as const, content: "hello" }],
};

describe("UnoRouter provider", () => {
  it("uses the documented endpoint and records only the serving credential slot", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.unorouter.com/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer primary-secret");
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
    expect(output.provider).toBe("unorouter:primary");
    expect(output.text).toBe("ok");
    expect(JSON.stringify(output)).not.toContain("primary-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back exactly once for 429 and respects a zero Retry-After", async () => {
    const authorizations: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      authorizations.push(authorization);
      if (authorization === "Bearer primary-secret") {
        return new Response(JSON.stringify({ error: { code: "rate_limit" } }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "0" },
        });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "fallback" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "test-model",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const output = await provider.generate(input, new AbortController().signal);
    expect(output.text).toBe("fallback");
    expect(output.provider).toBe("unorouter:fallback");
    expect(authorizations).toEqual(["Bearer primary-secret", "Bearer fallback-secret"]);
  });

  it("never uses fallback for authentication or model-not-found failures", async () => {
    const authFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
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

    const modelFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "model_not_found" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const modelProvider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "missing-model",
      fetchImpl: modelFetch as typeof fetch,
    });
    await expect(modelProvider.generate(input, new AbortController().signal)).rejects.toMatchObject(
      {
        code: "MODEL_ERROR",
        retryable: false,
      },
    );
    expect(modelFetch).toHaveBeenCalledTimes(1);
  });

  it("does not claim unverified per-model tool capability", async () => {
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      model: "test-model",
    });
    expect(provider.capabilities.has("tools")).toBe(false);
    await expect(
      provider.generate(
        {
          ...input,
          tools: [
            {
              id: "tasks.list",
              name: "List tasks",
              description: "List",
              inputSchema: { type: "object" },
            },
          ],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/tool-capable/iu);
  });
});
