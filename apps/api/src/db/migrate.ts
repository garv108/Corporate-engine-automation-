import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const pool = new Pool({ connectionString, max: 1 });

try {
  const sql = await readFile(resolve(process.cwd(), "../../database/001_initial_schema.sql"), "utf8");
  await pool.query(sql);
  console.info("CIAS database schema applied successfully");
} finally {
  await pool.end();
}
