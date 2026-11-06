import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });

const migrationName = "001_initial_schema";

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const alreadyApplied = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE name = $1",
    [migrationName]
  );

  if (alreadyApplied.rowCount) {
    console.info(`Migration ${migrationName} is already applied`);
  } else {
    const sql = await readFile(
      resolve(process.cwd(), "../../database/001_initial_schema.sql"),
      "utf8"
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationName]);
      await client.query("COMMIT");
      console.info(`Migration ${migrationName} applied successfully`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
