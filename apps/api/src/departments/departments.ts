import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requirePermission, type AuthenticatedPrincipal } from "../auth/auth.js";
import type { PoolClient } from "pg";

export type Department = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

export type DepartmentInput = {
  name: string;
  description?: string | null | undefined;
};

export type DepartmentUpdate = {
  name?: string | undefined;
  description?: string | null | undefined;
};

export interface DepartmentRepository {
  list(tenantId: string): Promise<Department[]>;
  get(tenantId: string, id: string): Promise<Department | null>;
  create(tenantId: string, actorId: string, input: DepartmentInput): Promise<Department>;
  update(tenantId: string, id: string, actorId: string, input: DepartmentUpdate): Promise<Department | null>;
}

type DepartmentRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

async function writeAuditEvent(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  action: string,
  department: Department,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    "INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata) VALUES ($1, 'user', $2, $3, 'department', $4, 'allowed', $5::jsonb)",
    [tenantId, actorId, action, department.id, JSON.stringify(metadata)]
  );
}

export const postgresDepartmentRepository: DepartmentRepository = {
  async list(tenantId) {
    const result = await pool.query<DepartmentRow>(
      "SELECT id, tenant_id AS \"tenantId\", name, description, created_at AS \"createdAt\" FROM departments WHERE tenant_id = $1 ORDER BY name, id",
      [tenantId]
    );
    return result.rows;
  },

  async get(tenantId, id) {
    const result = await pool.query<DepartmentRow>(
      "SELECT id, tenant_id AS \"tenantId\", name, description, created_at AS \"createdAt\" FROM departments WHERE tenant_id = $1 AND id = $2",
      [tenantId, id]
    );
    return result.rows[0] ?? null;
  },

  async create(tenantId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<DepartmentRow>(
        "INSERT INTO departments (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id, tenant_id AS \"tenantId\", name, description, created_at AS \"createdAt\"",
        [tenantId, input.name, input.description ?? null]
      );
      const department = result.rows[0]!;
      await writeAuditEvent(client, tenantId, actorId, "department.created", department, { name: department.name });
      await client.query("COMMIT");
      return department;
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
      const result = await client.query<DepartmentRow>(
        "UPDATE departments SET name = COALESCE($3, name), description = CASE WHEN $4::boolean THEN $5::text ELSE description END WHERE tenant_id = $1 AND id = $2 RETURNING id, tenant_id AS \"tenantId\", name, description, created_at AS \"createdAt\"",
        [tenantId, id, input.name ?? null, Object.prototype.hasOwnProperty.call(input, "description"), input.description ?? null]
      );
      const department = result.rows[0];
      if (!department) {
        await client.query("ROLLBACK");
        return null;
      }
      await writeAuditEvent(client, tenantId, actorId, "department.updated", department, { changedFields: Object.keys(input) });
      await client.query("COMMIT");
      return department;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};

const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional()
}).strict();

const updateDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional()
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

function handleConflict(error: unknown, response: Response): boolean {
  if ((error as { code?: string }).code !== "23505") return false;
  response.status(409).json({ error: { code: "CONFLICT", message: "A department with this name already exists" } });
  return true;
}

export function createDepartmentsRouter(repository: DepartmentRepository): ExpressRouter {
  const router = Router();

  router.get("/", requirePermission("departments:read"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    response.json({ data: await repository.list(principal.tenantId) });
  });

  router.get("/:id", requirePermission("departments:read"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) return validationError(response, "Department ID must be a UUID");
    const department = await repository.get(principal.tenantId, parsedId.data);
    if (!department) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Department not found" } });
    response.json({ data: department });
  });

  router.post("/", requirePermission("departments:create"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsed = createDepartmentSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error.issues[0]?.message ?? "Invalid department payload");
    try {
      const department = await repository.create(principal.tenantId, principal.subject, parsed.data);
      response.status(201).json({ data: department });
    } catch (error) {
      if (!handleConflict(error, response)) throw error;
    }
  });

  router.patch("/:id", requirePermission("departments:update"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) return validationError(response, "Department ID must be a UUID");
    const parsed = updateDepartmentSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error.issues[0]?.message ?? "Invalid department payload");
    try {
      const department = await repository.update(principal.tenantId, parsedId.data, principal.subject, parsed.data);
      if (!department) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Department not found" } });
      response.json({ data: department });
    } catch (error) {
      if (!handleConflict(error, response)) throw error;
    }
  });

  return router;
}
