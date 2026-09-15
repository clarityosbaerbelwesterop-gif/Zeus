import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
await client.connect();
try {
  const sql = (await readFile(new URL("../../tests/rls.sql", import.meta.url), "utf8")).replace(
    /^\\set[^\n]*\n/gmu,
    "",
  );
  await client.query(sql);
  console.log("Direct PostgreSQL RLS checks passed; fixture transaction rolled back.");
} finally {
  await client.end();
}
