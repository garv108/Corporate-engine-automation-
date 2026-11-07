import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { authenticationMiddleware, type IdentityVerifier } from "./auth/auth.js";
import { createDepartmentsRouter, postgresDepartmentRepository, type DepartmentRepository } from "./departments/departments.js";
import { createBusinessProcessesRouter, postgresBusinessProcessRepository, type BusinessProcessRepository } from "./business-processes/business-processes.js";
import { healthRouter } from "./routes/health.js";

const denyByDefaultVerifier: IdentityVerifier = {
  verify: async () => null
};

export function createApp(
  identityVerifier: IdentityVerifier = denyByDefaultVerifier,
  departmentRepository: DepartmentRepository = postgresDepartmentRepository,
  businessProcessRepository: BusinessProcessRepository = postgresBusinessProcessRepository
): Express {
  const application: Express = express();
  application.disable("x-powered-by");
  application.use(helmet());
  application.use(cors({ origin: config.CORS_ORIGIN.split(",").map((value) => value.trim()) }));
  application.use(express.json({ limit: "1mb" }));

  application.get("/", (_request, response) => {
    response.json({
      name: "CIAS API",
      version: "0.1.0",
      status: "running",
      docs: "API documentation will be added in a later phase."
    });
  });

  application.use("/api/v1/health", healthRouter);
  application.use(
    "/api/v1/departments",
    authenticationMiddleware(identityVerifier),
    createDepartmentsRouter(departmentRepository)
  );
  application.use(
    "/api/v1/business-processes",
    authenticationMiddleware(identityVerifier),
    createBusinessProcessesRouter(businessProcessRepository)
  );

  application.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  application.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error("Unhandled API error", error);
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  });

  return application;
}

export const app = createApp();
