import { checkDatabaseReadiness } from "@zeus/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseReadiness();
  const aiConfigured = Boolean(process.env.UNOROUTER_API_KEY_1);
  const authConfigured = Boolean(
    process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
  );
  const credentialKeyVersion = process.env.ZEUS_CREDENTIAL_KEY_VERSION?.trim() || "1";
  const credentialVaultConfigured = Boolean(
    process.env[`ZEUS_CREDENTIAL_KEY_V${credentialKeyVersion}`],
  );

  const ready =
    database.configured &&
    database.reachable &&
    database.schemaReady &&
    database.applicationRoleReady &&
    aiConfigured &&
    authConfigured &&
    credentialVaultConfigured;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      database,
      authConfigured,
      aiConfigured,
      credentialVaultConfigured,
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
