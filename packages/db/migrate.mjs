import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";

// Versioned SQL is the migration authority. The checksum ledger prevents a
// previously applied migration from silently changing on a later deployment.
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is required.");
if (new URL(connectionString).hostname.includes("-pooler.")) {
  throw new Error("Migrations require a direct database connection.");
}
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(20260915, 1)");
  await client.query("CREATE SCHEMA IF NOT EXISTS zeus_migrations");
  await client.query("REVOKE ALL ON SCHEMA zeus_migrations FROM PUBLIC");
  await client.query(`CREATE TABLE IF NOT EXISTS zeus_migrations.applied (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = new URL("./migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const { rows } = await client.query(
      "SELECT checksum FROM zeus_migrations.applied WHERE name=$1",
      [name],
    );
    if (rows[0]) {
      if (rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql.replace(/^BEGIN;\s*/u, "").replace(/COMMIT;\s*$/u, ""));
      await client.query("INSERT INTO zeus_migrations.applied(name,checksum) VALUES ($1,$2)", [
        name,
        checksum,
      ]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(20260915, 1)").catch(() => undefined);
  await client.end();
}
