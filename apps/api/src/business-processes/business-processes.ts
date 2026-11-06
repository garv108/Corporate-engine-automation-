import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requirePermission, type AuthenticatedPrincipal } from "../auth/auth.js";
import type { PoolClient } from "pg";

export type BusinessProcess = {
  id: string;
  tenantId: string;
  departmentId: string | null;
  name: string;
  description: string | null;
  systems: string[];
  inputs: string[];
  outputs: string[];
  sensitivity: string;
};

export type BusinessProcessInput = {
  departmentId?: string | null | undefined;
  name: string;
  description?: string | null | undefined;
  systems?: string[] | undefined;
  inputs?: string[] | undefined;
  outputs?: string[] | undefined;
  sensitivity?: string | undefined;
};

export type BusinessProcessUpdate = {
  departmentId?: string | null | undefined;
  name?: string | undefined;
  description?: string | null | undefined;
  systems?: string[] | undefined;
  inputs?: string[] | undefined;
  outputs?: string[] | undefined;
  sensitivity?: string | undefined;
};

export interface BusinessProcessRepository {
  list(tenantId: string): Promise<BusinessProcess[]>;
  get(tenantId: string, id: string): Promise<BusinessProcess | null>;
  create(tenantId: string, actorId: string, input: BusinessProcessInput): Promise<BusinessProcess>;
  update(tenantId: string, id: string, actorId: string, input: BusinessProcessUpdate): Promise<BusinessProcess | null>;
}

type BusinessProcessRow = BusinessProcess;

const selectColumns = `
  id,
  tenant_id AS "tenantId",
  department_id AS "departmentId",
  name,
  description,
  systems,
  inputs,
  outputs,
  sensitivity
`;

async function writeAuditEvent(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  action: string,
  process: BusinessProcess,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    "INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata) VALUES ($1, 'user', $2, $3, 'business_process', $4, 'allowed', $5::jsonb)",
    [tenantId, actorId, action, process.id, JSON.stringify(metadata)]
  );
}

export const postgresBusinessProcessRepository: BusinessProcessRepository = {
  async list(tenantId) {
    const result = await pool.query<BusinessProcessRow>(
      `SELECT ${selectColumns} FROM business_processes WHERE tenant_id = $1 ORDER BY name, id`,
      [tenantId]
    );
    return result.rows;
  },

  async get(tenantId, id) {
    const result = await pool.query<BusinessProcessRow>(
      `SELECT ${selectColumns} FROM business_processes WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] ?? null;
  },

  async create(tenantId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<BusinessProcessRow>(
        `INSERT INTO business_processes
          (tenant_id, department_id, name, description, systems, inputs, outputs, sensitivity)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
         RETURNING ${selectColumns}`,
        [
          tenantId,
          input.departmentId ?? null,
          input.name,
          input.description ?? null,
          JSON.stringify(input.systems ?? []),
          JSON.stringify(input.inputs ?? []),
          JSON.stringify(input.outputs ?? []),
          input.sensitivity ?? "unknown"
        ]
      );
      const process = result.rows[0]!;
      await writeAuditEvent(client, tenantId, actorId, "business_process.created", process, {
        name: process.name,
        departmentId: process.departmentId
      });
      await client.query("COMMIT");
      return process;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async update(tenantId, id, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<BusinessProcessRow>(
        `UPDATE business_processes SET
          department_id = CASE WHEN $3::boolean THEN $4::uuid ELSE department_id END,
          name = COALESCE($5, name),
          description = CASE WHEN $6::boolean THEN $7::text ELSE description END,
          systems = CASE WHEN $8::boolean THEN $9::jsonb ELSE systems END,
          inputs = CASE WHEN $10::boolean THEN $11::jsonb ELSE inputs END,
          outputs = CASE WHEN $12::boolean THEN $13::jsonb ELSE outputs END,
          sensitivity = COALESCE($14, sensitivity)
         WHERE tenant_id = $1 AND id = $2
         RETURNING ${selectColumns}`,
        [
          tenantId,
          id,
          Object.prototype.hasOwnProperty.call(input, "departmentId"),
          input.departmentId ?? null,
          input.name ?? null,
          Object.prototype.hasOwnProperty.call(input, "description"),
          input.description ?? null,
          Object.prototype.hasOwnProperty.call(input, "systems"),
          input.systems === undefined ? null : JSON.stringify(input.systems),
          Object.prototype.hasOwnProperty.call(input, "inputs"),
          input.inputs === undefined ? null : JSON.stringify(input.inputs),
          Object.prototype.hasOwnProperty.call(input, "outputs"),
          input.outputs === undefined ? null : JSON.stringify(input.outputs),
          input.sensitivity ?? null
        ]
      );
      const process = result.rows[0];
      if (!process) {
        await client.query("ROLLBACK");
        return null;
      }
      await writeAuditEvent(client, tenantId, actorId, "business_process.updated", process, {
        changedFields: Object.keys(input)
      });
      await client.query("COMMIT");
      return process;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};

const stringArray = z.array(z.string().trim().min(1).max(200)).max(100);
const createBusinessProcessSchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  systems: stringArray.optional(),
  inputs: stringArray.optional(),
  outputs: stringArray.optional(),
  sensitivity: z.string().trim().min(1).max(40).optional()
}).strict();

const updateBusinessProcessSchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  systems: stringArray.optional(),
  inputs: stringArray.optional(),
  outputs: stringArray.optional(),
  sensitivity: z.string().trim().min(1).max(40).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field must be provided");

const idSchema = z.string().uuid();

function currentPrincipal(request: Request, response: Response): AuthenticatedPrincipal | null {
  if (!request.principal) {
    response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } });
    return null;
  }
  return request.principal;
}

function validationError(response: Response, message: string): void {
  response.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function handleConstraintError(error: unknown, response: Response): boolean {
  const code = (error as { code?: string }).code;
  if (code === "23503") {
    response.status(400).json({
      error: { code: "INVALID_DEPARTMENT", message: "The selected department is not available in this tenant" }
    });
    return true;
  }
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "The business process could not be saved" } });
  return true;
}

export function createBusinessProcessesRouter(repository: BusinessProcessRepository): ExpressRouter {
  const router = Router();

  router.get("/", requirePermission("business_processes:read"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    response.json({ data: await repository.list(principal.tenantId) });
  });

  router.get("/:id", requirePermission("business_processes:read"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) return validationError(response, "Business process ID must be a UUID");
    const process = await repository.get(principal.tenantId, parsedId.data);
    if (!process) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Business process not found" } });
    response.json({ data: process });
  });

  router.post("/", requirePermission("business_processes:create"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsed = createBusinessProcessSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error.issues[0]?.message ?? "Invalid business process payload");
    try {
      const process = await repository.create(principal.tenantId, principal.subject, parsed.data);
      response.status(201).json({ data: process });
    } catch (error) {
      handleConstraintError(error, response);
    }
  });

  router.patch("/:id", requirePermission("business_processes:update"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) return validationError(response, "Business process ID must be a UUID");
    const parsed = updateBusinessProcessSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error.issues[0]?.message ?? "Invalid business process payload");
    try {
      const process = await repository.update(principal.tenantId, parsedId.data, principal.subject, parsed.data);
      if (!process) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Business process not found" } });
      response.json({ data: process });
    } catch (error) {
      handleConstraintError(error, response);
    }
  });

  return router;
}
