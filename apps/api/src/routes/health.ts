import { Router, type Router as ExpressRouter } from "express";
import { pool } from "../db/pool.js";

export const healthRouter: ExpressRouter = Router();

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
