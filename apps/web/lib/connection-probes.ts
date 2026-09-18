import { checkDatabaseReadiness } from "@zeus/db";
import { createUnoRouterProvider, DEFAULT_UNOROUTER_MODEL } from "@zeus/runtime/unorouter";

export type VerifiedConnectionProvider =
  "github" | "google_workspace" | "linkedin" | "neon" | "vercel" | "custom" | "unorouter";

export type ConnectionProbeStatus = "connected" | "needs_authorization" | "error";

export interface ConnectionProbeResult {
  readonly ok: boolean;
  readonly status: ConnectionProbeStatus;
  readonly code: string | null;
  readonly detail: string;
}

interface ProbeDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly databaseReadiness?: typeof checkDatabaseReadiness;
}

const providers = new Set<VerifiedConnectionProvider>([
  "github",
  "google_workspace",
  "linkedin",
  "neon",
  "vercel",
  "custom",
  "unorouter",
]);

export function isVerifiedConnectionProvider(value: string): value is VerifiedConnectionProvider {
  return providers.has(value as VerifiedConnectionProvider);
}

function envCredential(secretRef: string | null): { key: string; value: string } | null {
  const ref = secretRef?.trim() ?? "";
  if (!/^env:[A-Z][A-Z0-9_]{2,127}$/.test(ref)) return null;
  const key = ref.slice(4);
  const value = process.env[key]?.trim();
  return value ? { key, value } : null;
}

function failure(code: string, detail: string): ConnectionProbeResult {
  return { ok: false, status: "error", code, detail };
}

function authorizationRequired(code: string, detail: string): ConnectionProbeResult {
  return { ok: false, status: "needs_authorization", code, detail };
}

async function bearerProbe(
  url: string,
  credential: string,
  fetchImpl: typeof fetch,
  headers: Readonly<Record<string, string>> = {},
): Promise<ConnectionProbeResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
        ...headers,
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return failure("PROVIDER_UNREACHABLE", "The provider capability probe could not be completed.");
  }

  await response.body?.cancel().catch(() => undefined);
  if (response.ok) {
    return {
      ok: true,
      status: "connected",
      code: null,
      detail: "The provider accepted a live authenticated capability probe.",
    };
  }
  if (response.status === 401 || response.status === 403) {
    return failure("PROVIDER_AUTH_FAILED", "The provider rejected the configured credential.");
  }
  if (response.status === 429) {
    return failure("PROVIDER_RATE_LIMITED", "The provider rate-limited the capability probe.");
  }
  return failure(
    "PROVIDER_PROBE_FAILED",
    `The provider capability probe failed with HTTP ${response.status}.`,
  );
}

export async function probeConnection(
  provider: VerifiedConnectionProvider,
  secretRef: string | null,
  dependencies: ProbeDependencies = {},
): Promise<ConnectionProbeResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  if (provider === "custom") {
    return authorizationRequired(
      "MCP_AUTH_REQUIRED",
      "Custom MCP servers require the dedicated MCP discovery and OAuth flow before they can be connected.",
    );
  }
  if (provider === "google_workspace" || provider === "linkedin") {
    return authorizationRequired(
      "OAUTH_REQUIRED",
      "This provider requires a per-user OAuth authorization flow before it can be connected.",
    );
  }

  const credential = envCredential(secretRef);
  if (!credential) {
    return authorizationRequired(
      "CREDENTIAL_REQUIRED",
      "No resolvable server-side credential is configured for this connection.",
    );
  }

  if (provider === "unorouter") {
    const model = process.env.ZEUS_DEFAULT_MODEL?.trim() || DEFAULT_UNOROUTER_MODEL;
    const modelProvider = createUnoRouterProvider({
      primaryApiKey: credential.value,
      model,
      fetchImpl,
    });
    try {
      await modelProvider.generate(
        {
          system: "You are a production connectivity probe. Reply with OK only.",
          messages: [{ role: "user", content: "OK" }],
        },
        AbortSignal.timeout(15_000),
      );
      return {
        ok: true,
        status: "connected",
        code: null,
        detail: "UnoRouter completed a live model request.",
      };
    } catch {
      return failure("PROVIDER_PROBE_FAILED", "UnoRouter did not complete the live model probe.");
    }
  }

  if (provider === "github") {
    return bearerProbe("https://api.github.com/user", credential.value, fetchImpl, {
      "User-Agent": "ClarityCompassAi-Zeus",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  }

  if (provider === "vercel") {
    return bearerProbe("https://api.vercel.com/v9/projects?limit=1", credential.value, fetchImpl);
  }

  if (provider === "neon") {
    if (credential.key === "DATABASE_URL" || credential.key === "DATABASE_URL_UNPOOLED") {
      const readiness = await (dependencies.databaseReadiness ?? checkDatabaseReadiness)();
      if (
        readiness.configured &&
        readiness.reachable &&
        readiness.schemaReady &&
        readiness.applicationRoleReady
      ) {
        return {
          ok: true,
          status: "connected",
          code: null,
          detail:
            "The canonical Neon database is reachable and the Zeus application schema is ready.",
        };
      }
      return failure("DATABASE_NOT_READY", "The canonical Neon database readiness probe failed.");
    }
    return bearerProbe(
      "https://console.neon.tech/api/v2/projects?limit=1",
      credential.value,
      fetchImpl,
    );
  }

  return failure("PROVIDER_UNSUPPORTED", "No live capability probe exists for this provider.");
}
