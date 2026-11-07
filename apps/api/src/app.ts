import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { authenticationMiddleware, type IdentityVerifier } from "./auth/auth.js";
import { createDepartmentsRouter, postgresDepartmentRepository, type DepartmentRepository } from "./departments/departments.js";
import { createBusinessProcessesRouter, postgresBusinessProcessRepository, type BusinessProcessRepository } from "./business-processes/business-processes.js";
import { createAutomationOpportunitiesRouter, postgresAutomationOpportunityRepository, type AutomationOpportunityRepository } from "./opportunities/opportunities.js";
import { healthRouter } from "./routes/health.js";
import { createProcessModelsRouter, postgresProcessModelRepository, type ProcessModelRepository } from "./process-models/process-models.js";
import { createDiscoverySessionsRouter, postgresDiscoverySessionRepository, type DiscoverySessionRepository } from "./process-discovery/discovery-sessions.js";

const denyByDefaultVerifier: IdentityVerifier = {
  verify: async () => null
};

export function createApp(
  identityVerifier: IdentityVerifier = denyByDefaultVerifier,
  departmentRepository: DepartmentRepository = postgresDepartmentRepository,
  businessProcessRepository: BusinessProcessRepository = postgresBusinessProcessRepository,
  opportunityRepository: AutomationOpportunityRepository = postgresAutomationOpportunityRepository,
  processModelRepository: ProcessModelRepository = postgresProcessModelRepository,
  discoverySessionRepository: DiscoverySessionRepository = postgresDiscoverySessionRepository
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
  application.use(
    "/api/v1/business-processes/:processId/models",
    createProcessModelsRouter(processModelRepository)
  );
  application.use(
    "/api/v1/process-discovery/sessions",
    authenticationMiddleware(identityVerifier),
    createDiscoverySessionsRouter(discoverySessionRepository)
  );
  application.use(
    "/api/v1/opportunities",
    authenticationMiddleware(identityVerifier),
    createAutomationOpportunitiesRouter(opportunityRepository)
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
