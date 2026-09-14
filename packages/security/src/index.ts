import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface OpaqueToken {
  readonly raw: string;
  readonly prefix: string;
  readonly digest: string;
}

export function hashBearerToken(raw: string): string {
  if (!/^zts_[A-Za-z0-9_-]{43}$/u.test(raw)) throw new Error("Invalid Zeus token format.");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function createOpaqueToken(): OpaqueToken {
  const raw = `zts_${randomBytes(32).toString("base64url")}`;
  return Object.freeze({ raw, prefix: raw.slice(0, 12), digest: hashBearerToken(raw) });
}

export function tokenDigestMatches(raw: string, expectedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(expectedHex)) return false;
  let actual: Buffer;
  try {
    actual = Buffer.from(hashBearerToken(raw), "hex");
  } catch {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertTrustedOrigin(requestOrigin: string | null, publicOrigin: string): void {
  if (!requestOrigin) return;
  const expected = new URL(publicOrigin).origin;
  let supplied: string;
  try {
    supplied = new URL(requestOrigin).origin;
  } catch {
    throw new Error("Invalid request origin.");
  }
  if (supplied !== expected) throw new Error("Cross-origin mutation denied.");
}

export function safeAuditMetadata(
  input: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const forbidden = /(secret|password|token|authorization|cookie|key)/iu;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !forbidden.test(key)));
}
