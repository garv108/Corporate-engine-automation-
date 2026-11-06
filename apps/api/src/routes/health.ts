import { Router } from "express";
import { Pool } from "pg";
import { config } from "../config.js";

export const healthRouter = Router();
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 2 });

healthRouter.get("/live", (_request, response) => {
  response.json({ status: "ok", service: "cias-api" });
});

healthRouter.get("/ready", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ready", dependencies: { postgres: "ok" } });
  } catch {
    response.status(503).json({
      status: "not_ready",
      dependencies: { postgres: "unavailable" }
    });
  }
});
