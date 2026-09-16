/* eslint-disable */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { createMockPgClient } from "./mock-store";

export type ActorDatabase = NodePgDatabase<typeof schema>;
let pool: Pool | undefined;
let useMock = false;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
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
    client = createMockPgClient();
  } else {
    try {
      client = await getPool().connect();
    } catch (error) {
      console.warn("[Zeus] Database connection failed. Falling back to in-memory store.", error);
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

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
