import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UNOROUTER_FALLBACK_MODEL,
  DEFAULT_UNOROUTER_MODEL,
  createUnoRouterProvider,
} from "../packages/runtime/src/unorouter";

const input = {
  system: "Be concise.",
  messages: [{ role: "user" as const, content: "hello" }],
};

function bodyModel(init?: RequestInit): string | undefined {
  if (typeof init?.body !== "string") return undefined;
  return (JSON.parse(init.body) as { model?: string }).model;
}

describe("UnoRouter provider", () => {
  it("uses the documented endpoint and records only the serving credential slot", async () => {
    const fetchImpl = vi.fn<typeof fetch>((url, init) => {
      const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      expect(requestUrl).toBe("https://api.unorouter.com/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer primary-secret");
      return Promise.resolve(
        new Response(
          JSON.stringify({ model: "test-model", choices: [{ message: { content: "ok" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      model: "test-model",
      fetchImpl,
    });
    const output = await provider.generate(input, new AbortController().signal);
    expect(output.provider).toBe("unorouter:primary");
    expect(output.text).toBe("ok");
    expect(JSON.stringify(output)).not.toContain("primary-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the secondary credential for a retryable failure", async () => {
    const authorizations: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      authorizations.push(authorization);
      if (authorization === "Bearer primary-secret") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "rate_limit" } }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": "0" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "fallback" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "test-model",
      fetchImpl,
    });
    const output = await provider.generate(input, new AbortController().signal);
    expect(output.text).toBe("fallback");
    expect(output.provider).toBe("unorouter:fallback");
    expect(authorizations).toEqual(["Bearer primary-secret", "Bearer fallback-secret"]);
  });

  it("tries the secondary credential on auth failure but does not mask invalid credentials with a model switch", async () => {
    const attempts: Array<{ authorization: string; model?: string }> = [];
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      attempts.push({
        authorization: new Headers(init?.headers).get("authorization") ?? "",
        model: bodyModel(init),
      });
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "primary-model",
      fallbackModel: "backup-model",
      fetchImpl,
    });

    await expect(provider.generate(input, new AbortController().signal)).rejects.toMatchObject({
      code: "PROVIDER_AUTH_FAILED",
    });
    expect(attempts).toEqual([
      { authorization: "Bearer primary-secret", model: "primary-model" },
      { authorization: "Bearer fallback-secret", model: "primary-model" },
    ]);
  });

  it("switches to the fallback model when the primary model is unavailable", async () => {
    const attempts: Array<{ authorization: string; model?: string }> = [];
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const model = bodyModel(init);
      attempts.push({
        authorization: new Headers(init?.headers).get("authorization") ?? "",
        model,
      });
      if (model === "primary-model") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "model_not_found" } }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: "backup-model",
            choices: [{ message: { content: "backup" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "primary-model",
      fallbackModel: "backup-model",
      fetchImpl,
    });

    const output = await provider.generate(input, new AbortController().signal);
    expect(output.text).toBe("backup");
    expect(output.model).toBe("backup-model");
    expect(attempts).toEqual([
      { authorization: "Bearer primary-secret", model: "primary-model" },
      { authorization: "Bearer primary-secret", model: "backup-model" },
    ]);
  });

  it("uses a deterministic credential-then-model failover matrix", async () => {
    const attempts: Array<{ authorization: string; model?: string }> = [];
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      const model = bodyModel(init);
      attempts.push({ authorization, model });

      if (attempts.length === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "rate_limit" } }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": "0" },
          }),
        );
      }
      if (attempts.length === 2) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "upstream_unavailable" } }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "recovered" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const provider = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      fallbackApiKey: "fallback-secret",
      model: "primary-model",
      fallbackModel: "backup-model",
      fetchImpl,
    });
    const output = await provider.generate(input, new AbortController().signal);

    expect(output.text).toBe("recovered");
    expect(attempts).toEqual([
      { authorization: "Bearer primary-secret", model: "primary-model" },
      { authorization: "Bearer fallback-secret", model: "primary-model" },
      { authorization: "Bearer primary-secret", model: "backup-model" },
    ]);
  });

  it("enables tool capabilities only for the verified Zeus default model pair", async () => {
    const verified = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      model: DEFAULT_UNOROUTER_MODEL,
      fallbackModel: DEFAULT_UNOROUTER_FALLBACK_MODEL,
    });
    expect(verified.capabilities.has("tools")).toBe(true);
    expect(verified.capabilities.has("structured_output")).toBe(true);

    const unverified = createUnoRouterProvider({
      primaryApiKey: "primary-secret",
      model: "test-model",
    });
    expect(unverified.capabilities.has("tools")).toBe(false);
    await expect(
      unverified.generate(
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
