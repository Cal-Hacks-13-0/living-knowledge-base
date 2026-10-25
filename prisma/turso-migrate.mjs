// Applies prisma/migrations/*/migration.sql to the hosted Turso database
// (Prisma Migrate can't target Turso directly). Each migration is applied once,
// in order, and recorded in a `_turso_migrations` table, so re-running is safe.
//
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate:turso
// Create new migrations locally as usual (`npm run db:migrate`), then run this.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is not set.");
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

await db.execute(
  "CREATE TABLE IF NOT EXISTS _turso_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
);
const applied = new Set((await db.execute("SELECT name FROM _turso_migrations")).rows.map((r) => r.name));

const names = (await readdir(migrationsDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let count = 0;
for (const name of names) {
  if (applied.has(name)) continue;
  const sql = await readFile(path.join(migrationsDir, name, "migration.sql"), "utf8");
  await db.executeMultiple(sql);
  await db.execute({
    sql: "INSERT INTO _turso_migrations (name, applied_at) VALUES (?, ?)",
    args: [name, new Date().toISOString()],
  });
  console.log(`applied ${name}`);
  count++;
}
console.log(count ? `${count} migration(s) applied.` : "Database is up to date.");
db.close();
