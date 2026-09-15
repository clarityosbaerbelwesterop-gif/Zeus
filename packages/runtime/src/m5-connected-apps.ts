import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type ConnectionKind =
  "oauth" | "mcp_remote" | "mcp_local_gateway" | "api_key" | "service_account" | "platform_native";
export type ConnectionStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "expired"
  | "refreshing"
  | "needs_reauthorization"
  | "revoked"
  | "error";
export type ExternalProvider = "github" | "google" | "vercel" | "neon" | "linkedin";
export type SideEffectLevel = 0 | 1 | 2 | 3 | 4;
export type McpTransport = "stdio" | "streamable_http";

export interface CredentialEnvelope {
  version: number;
  iv: string;
  tag: string;
  ciphertext: string;
}
export interface CredentialVault {
  seal(value: string): CredentialEnvelope;
  unseal(value: CredentialEnvelope): string;
}

function b64url(value: Buffer): string {
  return value.toString("base64url");
}
function fromB64url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export class Aes256GcmCredentialVault implements CredentialVault {
  readonly #keys: ReadonlyMap<number, Buffer>;
  readonly #activeVersion: number;
  constructor(keys: ReadonlyMap<number, Buffer>, activeVersion: number) {
    const key = keys.get(activeVersion);
    if (!key || key.length !== 32)
      throw new Error("Credential vault requires a 32-byte active key.");
    for (const candidate of keys.values())
      if (candidate.length !== 32) throw new Error("All vault keys must be 32 bytes.");
    this.#keys = keys;
    this.#activeVersion = activeVersion;
  }
  seal(value: string): CredentialEnvelope {
    const key = this.#keys.get(this.#activeVersion)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      version: this.#activeVersion,
      iv: b64url(iv),
      tag: b64url(cipher.getAuthTag()),
      ciphertext: b64url(ciphertext),
    };
  }
  unseal(value: CredentialEnvelope): string {
    const key = this.#keys.get(value.version);
    if (!key) throw new Error("Credential key version is unavailable.");
    const decipher = createDecipheriv("aes-256-gcm", key, fromB64url(value.iv));
    decipher.setAuthTag(fromB64url(value.tag));
    return Buffer.concat([
      decipher.update(fromB64url(value.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
  }
}

export function credentialVaultFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Aes256GcmCredentialVault {
  const version = Number(env.ZEUS_CREDENTIAL_KEY_VERSION ?? "1");
  const encoded = env[`ZEUS_CREDENTIAL_KEY_V${version}`];
  if (!encoded) throw new Error("Credential vault key is not configured.");
  const key = Buffer.from(encoded, "base64");
  return new Aes256GcmCredentialVault(new Map([[version, key]]), version);
}

export interface OAuthAttempt {
  state: string;
  verifier: string;
  challenge: string;
  expiresAt: Date;
  redirectUri: string;
}
export function createOAuthAttempt(
  redirectUri: string,
  allowedRedirectUris: readonly string[],
  now = Date.now(),
): OAuthAttempt {
  if (!allowedRedirectUris.includes(redirectUri))
    throw new Error("OAuth redirect URI is not allow-listed.");
  const state = b64url(randomBytes(32));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { state, verifier, challenge, expiresAt: new Date(now + 10 * 60_000), redirectUri };
}
export function verifyOAuthState(
  expected: string,
  received: string,
  expiresAt: Date,
  consumed: boolean,
  now = Date.now(),
): void {
  if (consumed || expiresAt.getTime() <= now)
    throw new Error("OAuth state is expired or already consumed.");
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("OAuth state mismatch.");
}

export interface CanonicalExternalTool {
  id: string;
  provider: ExternalProvider;
  externalToolId: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  sideEffect: SideEffectLevel;
  requiredScopes: readonly string[];
  allowedAgents: readonly string[];
  approvalRequired: boolean;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface McpServerDefinition {
  id: string;
  provider: ExternalProvider;
  transport: McpTransport;
  endpoint?: string;
  command?: readonly string[];
}

export class McpRegistry {
  readonly #servers = new Map<string, McpServerDefinition>();
  readonly #tools = new Map<string, CanonicalExternalTool>();
  registerServer(server: McpServerDefinition): void {
    if (server.transport === "streamable_http" && !server.endpoint)
      throw new Error("Remote MCP requires an endpoint.");
    if (server.transport === "stdio" && !server.command?.length)
      throw new Error("stdio MCP requires a command.");
    if (this.#servers.has(server.id)) throw new Error(`Duplicate MCP server: ${server.id}`);
    this.#servers.set(server.id, Object.freeze({ ...server }));
  }
  registerTool(tool: CanonicalExternalTool): void {
    if (this.#tools.has(tool.id)) throw new Error(`Duplicate external tool: ${tool.id}`);
    if (tool.sideEffect >= 3 && !tool.approvalRequired)
      throw new Error("Level 3/4 external actions require approval.");
    this.#tools.set(tool.id, Object.freeze({ ...tool }));
  }
  discover(agent: string, grantedScopes: ReadonlySet<string>): readonly CanonicalExternalTool[] {
    return [...this.#tools.values()].filter(
      (tool) =>
        tool.allowedAgents.includes(agent) &&
        tool.requiredScopes.every((scope) => grantedScopes.has(scope)),
    );
  }
}

export function classifySql(sql: string): "read" | "write" | "schema" | "unknown" {
  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim()
    .toUpperCase();
  if (/^(SELECT|EXPLAIN)\b/.test(normalized)) return "read";
  if (/^(INSERT|UPDATE|DELETE)\b/.test(normalized)) return "write";
  if (/^(ALTER|CREATE|DROP|TRUNCATE)\b/.test(normalized)) return "schema";
  return "unknown";
}

export const M5_TOOL_POLICY: readonly CanonicalExternalTool[] = [
  {
    id: "github.pr.get",
    provider: "github",
    externalToolId: "pull_request_read",
    description: "Read pull request context",
    inputSchema: { type: "object" },
    sideEffect: 0,
    requiredScopes: ["github:repo:read"],
    allowedAgents: ["kai", "jorge", "simon"],
    approvalRequired: false,
    timeoutMs: 15_000,
    maxResponseBytes: 256_000,
  },
  {
    id: "github.issue.create",
    provider: "github",
    externalToolId: "issue_write",
    description: "Create an issue",
    inputSchema: { type: "object" },
    sideEffect: 3,
    requiredScopes: ["github:issues:write"],
    allowedAgents: ["kai", "jorge"],
    approvalRequired: true,
    timeoutMs: 15_000,
    maxResponseBytes: 64_000,
  },
  {
    id: "google.drive.search",
    provider: "google",
    externalToolId: "drive_search",
    description: "Search authorized Drive files",
    inputSchema: { type: "object" },
    sideEffect: 0,
    requiredScopes: ["google:drive:read"],
    allowedAgents: ["jorge", "sara"],
    approvalRequired: false,
    timeoutMs: 20_000,
    maxResponseBytes: 256_000,
  },
  {
    id: "google.gmail.draft.create",
    provider: "google",
    externalToolId: "gmail_draft",
    description: "Create a Gmail draft",
    inputSchema: { type: "object" },
    sideEffect: 2,
    requiredScopes: ["google:gmail:draft"],
    allowedAgents: ["jorge", "sara", "kai"],
    approvalRequired: false,
    timeoutMs: 20_000,
    maxResponseBytes: 128_000,
  },
  {
    id: "google.gmail.send",
    provider: "google",
    externalToolId: "gmail_send",
    description: "Send approved Gmail message",
    inputSchema: { type: "object" },
    sideEffect: 3,
    requiredScopes: ["google:gmail:send"],
    allowedAgents: ["jorge", "sara", "kai"],
    approvalRequired: true,
    timeoutMs: 20_000,
    maxResponseBytes: 128_000,
  },
  {
    id: "google.calendar.events.list",
    provider: "google",
    externalToolId: "calendar_list",
    description: "List authorized calendar events",
    inputSchema: { type: "object" },
    sideEffect: 0,
    requiredScopes: ["google:calendar:read"],
    allowedAgents: ["jorge", "sara"],
    approvalRequired: false,
    timeoutMs: 20_000,
    maxResponseBytes: 256_000,
  },
  {
    id: "vercel.deployments.list",
    provider: "vercel",
    externalToolId: "deployments_list",
    description: "Inspect deployments",
    inputSchema: { type: "object" },
    sideEffect: 0,
    requiredScopes: ["vercel:deployments:read"],
    allowedAgents: ["kai", "jorge", "simon"],
    approvalRequired: false,
    timeoutMs: 20_000,
    maxResponseBytes: 256_000,
  },
  {
    id: "vercel.preview.create",
    provider: "vercel",
    externalToolId: "preview_create",
    description: "Create preview deployment",
    inputSchema: { type: "object" },
    sideEffect: 3,
    requiredScopes: ["vercel:deployments:write"],
    allowedAgents: ["kai", "jorge"],
    approvalRequired: true,
    timeoutMs: 120_000,
    maxResponseBytes: 256_000,
  },
  {
    id: "neon.schema.inspect",
    provider: "neon",
    externalToolId: "schema_inspect",
    description: "Inspect database schema",
    inputSchema: { type: "object" },
    sideEffect: 0,
    requiredScopes: ["neon:project:read"],
    allowedAgents: ["kai", "simon"],
    approvalRequired: false,
    timeoutMs: 20_000,
    maxResponseBytes: 256_000,
  },
  {
    id: "neon.branches.create",
    provider: "neon",
    externalToolId: "branch_create",
    description: "Create development branch",
    inputSchema: { type: "object" },
    sideEffect: 3,
    requiredScopes: ["neon:branch:write"],
    allowedAgents: ["kai", "simon"],
    approvalRequired: true,
    timeoutMs: 30_000,
    maxResponseBytes: 128_000,
  },
  {
    id: "linkedin.profile.search",
    provider: "linkedin",
    externalToolId: "profile_search",
    description: "Research profiles where provider permits",
    inputSchema: { type: "object" },
    sideEffect: 0,
    requiredScopes: ["linkedin:profile:read"],
    allowedAgents: ["sara", "jorge"],
    approvalRequired: false,
    timeoutMs: 20_000,
    maxResponseBytes: 128_000,
  },
];
