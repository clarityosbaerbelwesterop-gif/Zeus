import { describe, expect, it } from "vitest";
import { Aes256GcmCredentialVault, McpRegistry, M5_TOOL_POLICY, classifySql, createOAuthAttempt, verifyOAuthState } from "../packages/runtime/src/m5-connected-apps";

describe("M5 connected-app security boundaries", () => {
  it("encrypts credentials with authenticated encryption and detects tampering", () => {
    const vault = new Aes256GcmCredentialVault(new Map([[1, Buffer.alloc(32, 7)]]), 1);
    const sealed = vault.seal("refresh-secret");
    expect(sealed.ciphertext).not.toContain("refresh-secret");
    expect(vault.unseal(sealed)).toBe("refresh-secret");
    expect(() => vault.unseal({ ...sealed, ciphertext: `${sealed.ciphertext.slice(0, -1)}A` })).toThrow();
  });

  it("creates PKCE S256 attempts only for exact allow-listed redirects", () => {
    const redirect = "https://zeus.example/api/oauth/callback/google";
    const attempt = createOAuthAttempt(redirect, [redirect], 1_000);
    expect(attempt.state.length).toBeGreaterThan(32);
    expect(attempt.challenge).not.toBe(attempt.verifier);
    verifyOAuthState(attempt.state, attempt.state, attempt.expiresAt, false, 2_000);
    expect(() => createOAuthAttempt("https://evil.example/callback", [redirect])).toThrow();
    expect(() => verifyOAuthState(attempt.state, "wrong", attempt.expiresAt, false, 2_000)).toThrow();
    expect(() => verifyOAuthState(attempt.state, attempt.state, attempt.expiresAt, true, 2_000)).toThrow();
  });

  it("Zeus, not MCP metadata, owns external side-effect and approval policy", () => {
    const registry = new McpRegistry();
    registry.registerServer({ id: "google", provider: "google", transport: "streamable_http", endpoint: "https://mcp.example.test" });
    for (const tool of M5_TOOL_POLICY) registry.registerTool(tool);
    const tools = registry.discover("sara", new Set(["google:drive:read", "google:gmail:send"]));
    expect(tools.map((tool) => tool.id)).toContain("google.drive.search");
    expect(tools.find((tool) => tool.id === "google.gmail.send")?.approvalRequired).toBe(true);
    expect(() => registry.registerTool({ ...M5_TOOL_POLICY[0]!, id: "unsafe", sideEffect: 3, approvalRequired: false })).toThrow();
  });

  it("classifies SQL conservatively", () => {
    expect(classifySql("SELECT * FROM users")).toBe("read");
    expect(classifySql("EXPLAIN SELECT 1")).toBe("read");
    expect(classifySql("UPDATE users SET name='x'")).toBe("write");
    expect(classifySql("DROP TABLE users")).toBe("schema");
    expect(classifySql("WITH x AS (SELECT 1) SELECT * FROM x")).toBe("unknown");
  });
});
