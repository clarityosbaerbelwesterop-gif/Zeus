import { createOpaqueToken, hashBearerToken, safeAuditMetadata, tokenDigestMatches } from "@zeus/security";
import { describe, expect, it } from "vitest";

describe("opaque API tokens", () => {
  it("creates a 256-bit bearer secret and only needs a digest for persistence", () => {
    const token = createOpaqueToken();
    expect(token.raw).toMatch(/^zts_[A-Za-z0-9_-]{43}$/u);
    expect(token.prefix).toMatch(/^zts_[A-Za-z0-9_-]{8}$/u);
    expect(token.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashBearerToken(token.raw)).toBe(token.digest);
    expect(tokenDigestMatches(token.raw, token.digest)).toBe(true);
    expect(tokenDigestMatches(createOpaqueToken().raw, token.digest)).toBe(false);
  });

  it("drops credential-like audit metadata keys", () => {
    expect(safeAuditMetadata({ project: "zeus", accessToken: "do-not-store", api_key: "secret", count: 2 })).toEqual({ project: "zeus", count: 2 });
  });
});
