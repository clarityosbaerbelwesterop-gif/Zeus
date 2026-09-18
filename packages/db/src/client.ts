/* eslint-disable */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isHostedRuntime, localMockOverrideEnabled } from "@zeus/security";
import * as schema from "./schema";
import { createMockPgClient } from "./mock-store";

export type ActorDatabase = NodePgDatabase<typeof schema>;
let pool: Pool | undefined;
let useMock = false;

function mockDatabaseAllowed(): boolean {
  return localMockOverrideEnabled("ZEUS_ALLOW_MOCK_DB");
}

function missingDatabaseUrlError(): Error {
  if (isHostedRuntime()) {
    return new Error(
      "DATABASE_URL is not configured. In-memory mock database is disabled when NODE_ENV=production or VERCEL_ENV is preview/production.",
    );
  }
  return new Error(
    "DATABASE_URL is not configured. Set DATABASE_URL, or ZEUS_ALLOW_MOCK_DB=1 for local development only.",
  );
}

function databaseUnavailableError(cause: unknown): Error {
  const message = isHostedRuntime()
    ? "Database connection failed. Refusing to fall back to an in-memory mock in production/preview."
    : "Database connection failed. Set a reachable DATABASE_URL, or ZEUS_ALLOW_MOCK_DB=1 for local development only.";
  return new Error(message, cause instanceof Error ? { cause } : undefined);
}

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (!mockDatabaseAllowed()) {
      throw missingDatabaseUrlError();
    }
    useMock = true;
    return createMockPgClient() as any;
  }
  pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

function validateActor(userId: string): void {
  if (
    !userId ||
    userId.length > 255 ||
    [...userId].some((character) => character.charCodeAt(0) < 32)
  ) {
    throw new Error("Invalid authenticated actor.");
  }
}

export async function withActor<T>(
  userId: string,
  action: (db: ActorDatabase) => Promise<T>,
): Promise<T> {
  validateActor(userId);
  let client: any;
  if (!process.env.DATABASE_URL || useMock) {
    if (!mockDatabaseAllowed()) {
      throw missingDatabaseUrlError();
    }
    client = createMockPgClient();
  } else {
    try {
      client = await getPool().connect();
    } catch (error) {
      if (!mockDatabaseAllowed()) {
        throw databaseUnavailableError(error);
      }
      console.warn(
        "[Zeus] Database connection failed. Falling back to in-memory store because ZEUS_ALLOW_MOCK_DB=1.",
        error,
      );
      useMock = true;
      client = createMockPgClient();
    }
  }

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE zeus_app");
    await client.query("SET LOCAL statement_timeout = '8s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    await client.query("SELECT set_config('zeus.user_id', $1, true)", [userId]);
    const result = await action(drizzle(client, { schema }));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (client && typeof client.release === "function") {
      client.release();
    }
  }
}

export interface DatabaseReadiness {
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly schemaReady: boolean;
  readonly applicationRoleReady: boolean;
}

export async function checkDatabaseReadiness(): Promise<DatabaseReadiness> {
  if (!process.env.DATABASE_URL) {
    return {
      configured: false,
      reachable: false,
      schemaReady: false,
      applicationRoleReady: false,
    };
  }

  let client: any;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    const result = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'zeus') AS schema_ready, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zeus_app' AND rolbypassrls = false) AS role_ready",
    );
    await client.query("COMMIT");
    const row = result.rows?.[0] ?? {};
    return {
      configured: true,
      reachable: true,
      schemaReady: Boolean(row.schema_ready),
      applicationRoleReady: Boolean(row.role_ready),
    };
  } catch {
    await client?.query("ROLLBACK").catch(() => undefined);
    return {
      configured: true,
      reachable: false,
      schemaReady: false,
      applicationRoleReady: false,
    };
  } finally {
    if (client && typeof client.release === "function") client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
  useMock = false;
}
