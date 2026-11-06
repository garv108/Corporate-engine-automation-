import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN.split(",").map((value) => value.trim()) }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_request, response) => {
  response.json({
    name: "CIAS API",
    version: "0.1.0",
    status: "running",
    docs: "API documentation will be added in a later phase."
  });
});

app.use("/api/v1/health", healthRouter);

app.use((_request, response) => {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});
