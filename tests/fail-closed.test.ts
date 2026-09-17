import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, withActor } from "../packages/db/src/client";
import { envCredentialRef } from "../packages/db/src/mock-store";
import {
  assertTrustedOrigin,
  isHostedRuntime,
  localMockOverrideEnabled,
  resolvePublicOrigin,
} from "../packages/security/src/index";

describe("hosted runtime detection", () => {
  it("treats production Node and Vercel preview/production as hosted", () => {
    expect(isHostedRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(isHostedRuntime({ NODE_ENV: "test", VERCEL_ENV: "preview" })).toBe(true);
    expect(isHostedRuntime({ NODE_ENV: "test", VERCEL_ENV: "production" })).toBe(true);
    expect(isHostedRuntime({ NODE_ENV: "test" })).toBe(false);
    expect(isHostedRuntime({ NODE_ENV: "development", VERCEL_ENV: "development" })).toBe(false);
  });

  it("never enables local mocks on hosted runtimes, even with the override flag", () => {
    expect(
      localMockOverrideEnabled("ZEUS_ALLOW_MOCK_AUTH", {
        NODE_ENV: "production",
        ZEUS_ALLOW_MOCK_AUTH: "1",
      }),
    ).toBe(false);
    expect(
      localMockOverrideEnabled("ZEUS_ALLOW_MOCK_DB", {
        VERCEL_ENV: "preview",
        ZEUS_ALLOW_MOCK_DB: "1",
      }),
    ).toBe(false);
    expect(
      localMockOverrideEnabled("ZEUS_ALLOW_MOCK_AUTH", {
        NODE_ENV: "test",
        ZEUS_ALLOW_MOCK_AUTH: "1",
      }),
    ).toBe(true);
    expect(
      localMockOverrideEnabled("ZEUS_ALLOW_MOCK_DB", {
        NODE_ENV: "development",
        ZEUS_ALLOW_MOCK_DB: "1",
      }),
    ).toBe(true);
    expect(localMockOverrideEnabled("ZEUS_ALLOW_MOCK_AUTH", { NODE_ENV: "test" })).toBe(false);
  });
});

describe("trusted origin", () => {
  it("prefers ZEUS_PUBLIC_ORIGIN then ZEUS_APP_URL", () => {
    expect(
      resolvePublicOrigin({
        ZEUS_PUBLIC_ORIGIN: "https://app.example",
        ZEUS_APP_URL: "https://other.example",
      }),
    ).toBe("https://app.example");
    expect(resolvePublicOrigin({ ZEUS_APP_URL: " https://zeus.example " })).toBe(
      "https://zeus.example",
    );
    expect(resolvePublicOrigin({})).toBeNull();
  });

  it("denies mismatched mutation origins", () => {
    expect(() => assertTrustedOrigin(null, "https://zeus.example")).not.toThrow();
    expect(() =>
      assertTrustedOrigin("https://zeus.example/app", "https://zeus.example"),
    ).not.toThrow();
    expect(() => assertTrustedOrigin("https://evil.example", "https://zeus.example")).toThrow(
      /Cross-origin mutation denied/,
    );
    expect(() => assertTrustedOrigin("not-a-url", "https://zeus.example")).toThrow(
      /Invalid request origin/,
    );
  });
});

describe("honest mock connection secrets", () => {
  it("uses env:VAR only when the matching process.env value exists", () => {
    expect(envCredentialRef("UNOROUTER_API_KEY_1", { UNOROUTER_API_KEY_1: "present" })).toEqual({
      status: "connected",
      secret_ref: "env:UNOROUTER_API_KEY_1",
    });
    expect(envCredentialRef("UNOROUTER_API_KEY_1", {})).toEqual({
      status: "not_connected",
      secret_ref: null,
    });
    expect(envCredentialRef("GEMINI_API_KEY", { UNOROUTER_API_KEY_1: "other" })).toEqual({
      status: "not_connected",
      secret_ref: null,
    });
  });
});

describe("fail-closed mock database", () => {
  afterEach(async () => {
    await closeDatabase();
    vi.unstubAllEnvs();
  });

  it("refuses the in-memory mock in production even if ZEUS_ALLOW_MOCK_DB=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ZEUS_ALLOW_MOCK_DB", "1");
    await expect(withActor("usr_lead_operator", () => Promise.resolve("ok"))).rejects.toThrow(
      /disabled when NODE_ENV=production or VERCEL_ENV/,
    );
  });

  it("refuses the in-memory mock on Vercel preview", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ZEUS_ALLOW_MOCK_DB", "1");
    await expect(withActor("usr_lead_operator", () => Promise.resolve("ok"))).rejects.toThrow(
      /disabled when NODE_ENV=production or VERCEL_ENV/,
    );
  });

  it("refuses the in-memory mock locally unless ZEUS_ALLOW_MOCK_DB=1", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ZEUS_ALLOW_MOCK_DB", "");
    await expect(withActor("usr_lead_operator", () => Promise.resolve("ok"))).rejects.toThrow(
      /ZEUS_ALLOW_MOCK_DB=1/,
    );
  });

  it("uses the in-memory mock only when explicitly allowed locally", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ZEUS_ALLOW_MOCK_DB", "1");
    await expect(withActor("usr_lead_operator", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});

describe("product-path regressions", () => {
  it("does not hardcode integration status connected in the server action", () => {
    const source = readFileSync(new URL("../apps/web/app/app/actions.ts", import.meta.url), "utf8");
    expect(source).toContain("saveIntegrationConnection({");
    expect(source).not.toMatch(/status:\s*"connected"/);
  });

  it("installs mock auth only behind the local allow flag", () => {
    const source = readFileSync(new URL("../packages/auth/src/server.ts", import.meta.url), "utf8");
    expect(source).toContain('localMockOverrideEnabled("ZEUS_ALLOW_MOCK_AUTH")');
    expect(source).toContain("createMockAuth()");
    expect(source).toContain("Mock auth is disabled when NODE_ENV=production");
    expect(source).toMatch(
      /if \(!localMockOverrideEnabled\("ZEUS_ALLOW_MOCK_AUTH"\)\) \{\s*throw missingAuthError/,
    );
  });

  it("does not seed fake vault: connection secrets", () => {
    const source = readFileSync(
      new URL("../packages/db/src/mock-store.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/vault:/);
    expect(source).toContain("envCredentialRef");
    expect(source).toContain("UNOROUTER_API_KEY_1");
  });

  it("does not market vault encryption in workspace settings", () => {
    const source = readFileSync(
      new URL("../apps/web/components/workspace-settings.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/Save & Encrypt Key/);
    expect(source).not.toMatch(/Confidential Vault Storage/);
    expect(source).toContain("env:VAR_NAME");
    expect(source).toContain("Save env:VAR reference");
  });
});
