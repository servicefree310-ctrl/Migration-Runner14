/**
 * Zebvix — Drizzle Migration Baseline Script
 *
 * Run this ONCE on any database that was previously set up using
 * `drizzle-kit push` (instead of `drizzle-kit migrate`). It marks
 * all existing migration files as "already applied" so future
 * `pnpm --filter @workspace/db run migrate` commands only apply
 * NEW migrations, without trying to recreate tables that exist.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx src/baseline.ts
 *   — or —
 *   pnpm --filter @workspace/db run baseline
 *
 * Safe to run multiple times (idempotent).
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dir, "../drizzle");

// Drizzle-kit stores migrations in this table (PostgreSQL dialect)
const CREATE_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS "drizzle"`;
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
    id        SERIAL PRIMARY KEY,
    hash      text    NOT NULL,
    created_at bigint
  )
`;

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    // Read all .sql migration files in order
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // lexicographic order = chronological (0000_, 0001_, ...)

    if (files.length === 0) {
      console.log("No migration files found in", MIGRATIONS_DIR);
      process.exit(0);
    }

    // Ensure tracking schema + table exist
    await client.query(CREATE_SCHEMA_SQL);
    await client.query(CREATE_TABLE_SQL);

    // Fetch hashes already recorded
    const { rows } = await client.query<{ hash: string }>(
      `SELECT hash FROM "drizzle"."__drizzle_migrations"`,
    );
    const applied = new Set(rows.map((r) => r.hash));

    let marked = 0;
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");

      if (applied.has(hash)) {
        console.log(`  ✔  ${file} — already recorded (skipped)`);
        continue;
      }

      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [hash, Date.now()],
      );
      console.log(`  ✔  ${file} — marked as applied (hash: ${hash.slice(0, 12)}…)`);
      marked++;
    }

    if (marked === 0) {
      console.log("\nDatabase is already baselined — nothing to do.");
    } else {
      console.log(`\nBaselined ${marked} migration(s). Future \`migrate\` runs will only apply NEW migrations.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Baseline failed:", err.message);
  process.exit(1);
});
