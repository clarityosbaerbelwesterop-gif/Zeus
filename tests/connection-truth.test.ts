import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isVerifiedConnectionProvider, probeConnection } from "../apps/web/lib/connection-probes";

describe("connection truthfulness", () => {
  it("keeps unimplemented MCP/OAuth connections out of connected state", async () => {
    await expect(probeConnection("custom", null)).resolves.toMatchObject({
      ok: false,
      status: "needs_authorization",
      code: "MCP_AUTH_REQUIRED",
    });
    await expect(probeConnection("google_workspace", null)).resolves.toMatchObject({
      ok: false,
      status: "needs_authorization",
      code: "OAUTH_REQUIRED",
    });
  });

  it("only marks bearer providers connected after an authenticated HTTP success", async () => {
    const previous = process.env.VERCEL_TOKEN;
    process.env.VERCEL_TOKEN = "test-token";
    try {
      const accepted = await probeConnection("vercel", "env:VERCEL_TOKEN", {
        fetchImpl: () => Promise.resolve(new Response("{}", { status: 200 })),
      });
      expect(accepted).toMatchObject({ ok: true, status: "connected" });

      const rejected = await probeConnection("vercel", "env:VERCEL_TOKEN", {
        fetchImpl: () => Promise.resolve(new Response("{}", { status: 401 })),
      });
      expect(rejected).toMatchObject({
        ok: false,
        status: "error",
        code: "PROVIDER_AUTH_FAILED",
      });
    } finally {
      if (previous === undefined) delete process.env.VERCEL_TOKEN;
      else process.env.VERCEL_TOKEN = previous;
    }
  });

  it("uses a real model response contract for UnoRouter verification", async () => {
    const previous = process.env.UNOROUTER_API_KEY_1;
    process.env.UNOROUTER_API_KEY_1 = "test-key";
    try {
      const result = await probeConnection("unorouter", "env:UNOROUTER_API_KEY_1", {
        fetchImpl: () =>
          Promise.resolve(
            Response.json({
              model: "glm-5.3",
              choices: [{ message: { content: "OK" } }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
          ),
      });
      expect(result).toMatchObject({ ok: true, status: "connected" });
    } finally {
      if (previous === undefined) delete process.env.UNOROUTER_API_KEY_1;
      else process.env.UNOROUTER_API_KEY_1 = previous;
    }
  });

  it("migrates connection provider and verification states without deleting data", async () => {
    const sql = await readFile(
      new URL("../packages/db/migrations/0010_connection_truth.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("'unorouter'");
    expect(sql).toContain("'verifying'");
    expect(sql).toContain("'needs_authorization'");
    expect(sql).toContain("'connected'");
    expect(sql).not.toMatch(/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/iu);
  });

  it("rejects unknown connection providers", () => {
    expect(isVerifiedConnectionProvider("unorouter")).toBe(true);
    expect(isVerifiedConnectionProvider("invented-provider")).toBe(false);
  });
});
