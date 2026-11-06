import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
const migrationsDirectory = fileURLToPath(new URL("../../../../database/", import.meta.url));
const migrationLockId = "7319042026";

type MigrationRecord = { name: string; checksum: string };

async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [migrationLockId]);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT");

    const legacyRecord = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE checksum IS NULL LIMIT 1"
    );
    if (legacyRecord.rowCount) {
      throw new Error(
        `Migration history for "${legacyRecord.rows[0]?.name}" has no checksum. Verify the existing database schema and baseline its checksum manually before continuing.`
      );
    }

    await client.query("ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL");

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort((left, right) => left.localeCompare(right));

    if (files.length === 0) {
      throw new Error(`No SQL migrations found in ${migrationsDirectory}`);
    }

    const applied = await client.query<MigrationRecord>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name"
    );
    const appliedByName = new Map(applied.rows.map((row) => [row.name, row]));
    const migrationFiles = new Set(files);
    const unknownApplied = applied.rows.find((row) => !migrationFiles.has(row.name));
    if (unknownApplied) {
      throw new Error(
        `Database records migration "${unknownApplied.name}" that is missing from this repository. Restore the migration file before continuing.`
      );
    }

    for (const file of files) {
      const sql = await readFile(join(migrationsDirectory, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = appliedByName.get(file);

      if (previous) {
        if (previous.checksum !== checksum) {
          throw new Error(
            `Applied migration "${file}" has changed. Create a new migration instead of editing an applied migration.`
          );
        }
        console.info(`Migration ${file} is already applied`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [file, checksum]
        );
        await client.query("COMMIT");
        console.info(`Migration ${file} applied successfully`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [migrationLockId]);
    }
    client.release();
  }
}

try {
  await runMigrations();
} finally {
  await pool.end();
}
