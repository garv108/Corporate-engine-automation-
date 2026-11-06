import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requirePermission, type AuthenticatedPrincipal } from "../auth/auth.js";
import type { PoolClient } from "pg";

export type AutomationOpportunity = {
  id: string;
  tenantId: string;
  departmentId: string | null;
  processId: string | null;
  title: string;
  problemStatement: string;
  proposedOutcome: string | null;
  feasibilityScore: number | null;
  impactScore: number | null;
  complexityScore: number | null;
  confidence: number | null;
  impactEstimate: Record<string, unknown>;
  evidenceRefs: unknown[];
  status: string;
};

export type AutomationOpportunityInput = {
  departmentId?: string | null | undefined;
  processId?: string | null | undefined;
  title: string;
  problemStatement: string;
  proposedOutcome?: string | null | undefined;
  feasibilityScore?: number | null | undefined;
  impactScore?: number | null | undefined;
  complexityScore?: number | null | undefined;
  confidence?: number | null | undefined;
  impactEstimate?: Record<string, unknown> | undefined;
  evidenceRefs?: unknown[] | undefined;
  status?: string | undefined;
};

export type AutomationOpportunityUpdate = Partial<AutomationOpportunityInput>;

export interface AutomationOpportunityRepository {
  list(tenantId: string): Promise<AutomationOpportunity[]>;
  get(tenantId: string, id: string): Promise<AutomationOpportunity | null>;
  create(tenantId: string, actorId: string, input: AutomationOpportunityInput): Promise<AutomationOpportunity>;
  update(tenantId: string, id: string, actorId: string, input: AutomationOpportunityUpdate): Promise<AutomationOpportunity | null>;
}

type OpportunityRow = AutomationOpportunity;

const selectColumns = `
  id,
  tenant_id AS "tenantId",
  department_id AS "departmentId",
  process_id AS "processId",
  title,
  problem_statement AS "problemStatement",
  proposed_outcome AS "proposedOutcome",
  feasibility_score::float8 AS "feasibilityScore",
  impact_score::float8 AS "impactScore",
  complexity_score::float8 AS "complexityScore",
  confidence::float8 AS confidence,
  impact_estimate AS "impactEstimate",
  evidence_refs AS "evidenceRefs",
  status
`;

async function writeAuditEvent(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  action: string,
  opportunity: AutomationOpportunity,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    "INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata) VALUES ($1, 'user', $2, $3, 'automation_opportunity', $4, 'allowed', $5::jsonb)",
    [tenantId, actorId, action, opportunity.id, JSON.stringify(metadata)]
  );
}

export const postgresAutomationOpportunityRepository: AutomationOpportunityRepository = {
  async list(tenantId) {
    const result = await pool.query<OpportunityRow>(
      `SELECT ${selectColumns} FROM automation_opportunities WHERE tenant_id = $1 ORDER BY title, id`,
      [tenantId]
    );
    return result.rows;
  },

  async get(tenantId, id) {
    const result = await pool.query<OpportunityRow>(
      `SELECT ${selectColumns} FROM automation_opportunities WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] ?? null;
  },

  async create(tenantId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<OpportunityRow>(
        `INSERT INTO automation_opportunities (
          tenant_id, department_id, process_id, title, problem_statement, proposed_outcome,
          feasibility_score, impact_score, complexity_score, confidence, impact_estimate, evidence_refs, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13
        ) RETURNING ${selectColumns}`,
        [
          tenantId,
          input.departmentId ?? null,
          input.processId ?? null,
          input.title,
          input.problemStatement,
          input.proposedOutcome ?? null,
          input.feasibilityScore ?? null,
          input.impactScore ?? null,
          input.complexityScore ?? null,
          input.confidence ?? null,
          JSON.stringify(input.impactEstimate ?? {}),
          JSON.stringify(input.evidenceRefs ?? []),
          input.status ?? "discovered"
        ]
      );
      const opportunity = result.rows[0]!;
      await writeAuditEvent(client, tenantId, actorId, "automation_opportunity.created", opportunity, {
        title: opportunity.title,
        departmentId: opportunity.departmentId,
        processId: opportunity.processId
      });
      await client.query("COMMIT");
      return opportunity;
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
      const result = await client.query<OpportunityRow>(
        `UPDATE automation_opportunities SET
          department_id = CASE WHEN $3::boolean THEN $4::uuid ELSE department_id END,
          process_id = CASE WHEN $5::boolean THEN $6::uuid ELSE process_id END,
          title = COALESCE($7, title),
          problem_statement = COALESCE($8, problem_statement),
          proposed_outcome = CASE WHEN $9::boolean THEN $10::text ELSE proposed_outcome END,
          feasibility_score = CASE WHEN $11::boolean THEN $12::numeric ELSE feasibility_score END,
          impact_score = CASE WHEN $13::boolean THEN $14::numeric ELSE impact_score END,
          complexity_score = CASE WHEN $15::boolean THEN $16::numeric ELSE complexity_score END,
          confidence = CASE WHEN $17::boolean THEN $18::numeric ELSE confidence END,
          impact_estimate = CASE WHEN $19::boolean THEN $20::jsonb ELSE impact_estimate END,
          evidence_refs = CASE WHEN $21::boolean THEN $22::jsonb ELSE evidence_refs END,
          status = COALESCE($23, status)
         WHERE tenant_id = $1 AND id = $2
         RETURNING ${selectColumns}`,
        [
          tenantId,
          id,
          Object.prototype.hasOwnProperty.call(input, "departmentId"),
          input.departmentId ?? null,
          Object.prototype.hasOwnProperty.call(input, "processId"),
          input.processId ?? null,
          input.title ?? null,
          input.problemStatement ?? null,
          Object.prototype.hasOwnProperty.call(input, "proposedOutcome"),
          input.proposedOutcome ?? null,
          Object.prototype.hasOwnProperty.call(input, "feasibilityScore"),
          input.feasibilityScore ?? null,
          Object.prototype.hasOwnProperty.call(input, "impactScore"),
          input.impactScore ?? null,
          Object.prototype.hasOwnProperty.call(input, "complexityScore"),
          input.complexityScore ?? null,
          Object.prototype.hasOwnProperty.call(input, "confidence"),
          input.confidence ?? null,
          Object.prototype.hasOwnProperty.call(input, "impactEstimate"),
          input.impactEstimate === undefined ? null : JSON.stringify(input.impactEstimate),
          Object.prototype.hasOwnProperty.call(input, "evidenceRefs"),
          input.evidenceRefs === undefined ? null : JSON.stringify(input.evidenceRefs),
          input.status ?? null
        ]
      );
      const opportunity = result.rows[0];
      if (!opportunity) {
        await client.query("ROLLBACK");
        return null;
      }
      await writeAuditEvent(client, tenantId, actorId, "automation_opportunity.updated", opportunity, {
        changedFields: Object.keys(input)
      });
      await client.query("COMMIT");
      return opportunity;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};

const score = z.number().finite().min(0).max(100).nullable().optional();
const createOpportunitySchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  processId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  problemStatement: z.string().trim().min(5).max(4000),
  proposedOutcome: z.string().trim().max(2000).nullable().optional(),
  feasibilityScore: score,
  impactScore: score,
  complexityScore: score,
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
  impactEstimate: z.record(z.string(), z.unknown()).optional(),
  evidenceRefs: z.array(z.unknown()).max(200).optional(),
  status: z.string().trim().min(1).max(40).optional()
}).strict();

const updateOpportunitySchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  processId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200).optional(),
  problemStatement: z.string().trim().min(5).max(4000).optional(),
  proposedOutcome: z.string().trim().max(2000).nullable().optional(),
  feasibilityScore: score,
  impactScore: score,
  complexityScore: score,
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
  impactEstimate: z.record(z.string(), z.unknown()).optional(),
  evidenceRefs: z.array(z.unknown()).max(200).optional(),
  status: z.string().trim().min(1).max(40).optional()
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

function handleAssociationError(error: unknown, response: Response): void {
  if ((error as { code?: string }).code === "23503") {
    response.status(400).json({
      error: { code: "INVALID_ASSOCIATION", message: "The selected department or process is not available in this tenant" }
    });
    return;
  }
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "The opportunity could not be saved" } });
}

export function createAutomationOpportunitiesRouter(repository: AutomationOpportunityRepository): ExpressRouter {
  const router = Router();

  router.get("/", requirePermission("opportunities:read"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    response.json({ data: await repository.list(principal.tenantId) });
  });

  router.get("/:id", requirePermission("opportunities:read"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) return validationError(response, "Opportunity ID must be a UUID");
    const opportunity = await repository.get(principal.tenantId, parsedId.data);
    if (!opportunity) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
    response.json({ data: opportunity });
  });

  router.post("/", requirePermission("opportunities:create"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsed = createOpportunitySchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error.issues[0]?.message ?? "Invalid opportunity payload");
    try {
      const opportunity = await repository.create(principal.tenantId, principal.subject, parsed.data);
      response.status(201).json({ data: opportunity });
    } catch (error) {
      handleAssociationError(error, response);
    }
  });

  router.patch("/:id", requirePermission("opportunities:update"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) return validationError(response, "Opportunity ID must be a UUID");
    const parsed = updateOpportunitySchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error.issues[0]?.message ?? "Invalid opportunity payload");
    try {
      const opportunity = await repository.update(principal.tenantId, parsedId.data, principal.subject, parsed.data);
      if (!opportunity) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
      response.json({ data: opportunity });
    } catch (error) {
      handleAssociationError(error, response);
    }
  });

  return router;
}
