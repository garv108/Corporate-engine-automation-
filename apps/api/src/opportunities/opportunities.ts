import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requirePermission, type AuthenticatedPrincipal } from "../auth/auth.js";
import type { PoolClient } from "pg";
import {
  encodePaginationCursor,
  parsePaginationQuery,
  type Page,
  type PaginationOptions
} from "../pagination/cursor-pagination.js";

export const opportunityStatuses = [
  "discovered",
  "qualified",
  "alternatives_compared",
  "business_case_drafted",
  "approval_pending",
  "approved_for_design",
  "deferred",
  "rejected"
] as const;

export type OpportunityStatus = (typeof opportunityStatuses)[number];

const statusTransitions: Record<OpportunityStatus, readonly OpportunityStatus[]> = {
  discovered: ["qualified", "deferred", "rejected"],
  qualified: ["alternatives_compared", "deferred", "rejected"],
  alternatives_compared: ["business_case_drafted", "deferred", "rejected"],
  business_case_drafted: ["approval_pending", "deferred", "rejected"],
  approval_pending: ["approved_for_design", "deferred", "rejected"],
  approved_for_design: [],
  deferred: ["qualified", "rejected"],
  rejected: []
};

export function canTransitionOpportunityStatus(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return from === to || statusTransitions[from].includes(to);
}

export class OpportunityStatusTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: OpportunityStatus
  ) {
    super(`Opportunity status cannot transition from "${from}" to "${to}"`);
    this.name = "OpportunityStatusTransitionError";
  }
}

export type AutomationOpportunity = {
  id: string;
  tenantId: string;
  departmentId: string | null;
  processId: string | null;
  title: string;
  problemStatement: string;
  proposedOutcome: string | null;
  impactEstimate: Record<string, unknown>;
  evidenceRefs: string[];
  status: OpportunityStatus;
};

export type AutomationOpportunityInput = {
  departmentId?: string | null | undefined;
  processId?: string | null | undefined;
  title: string;
  problemStatement: string;
  proposedOutcome?: string | null | undefined;
  impactEstimate?: Record<string, unknown> | undefined;
  evidenceRefs?: string[] | undefined;
};

export type AutomationOpportunityUpdate = {
  departmentId?: string | null | undefined;
  processId?: string | null | undefined;
  title?: string | undefined;
  problemStatement?: string | undefined;
  proposedOutcome?: string | null | undefined;
  impactEstimate?: Record<string, unknown> | undefined;
  evidenceRefs?: string[] | undefined;
  status?: OpportunityStatus | undefined;
};

export interface AutomationOpportunityRepository {
  list(tenantId: string, pagination: PaginationOptions): Promise<Page<AutomationOpportunity>>;
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
  async list(tenantId, pagination) {
    const result = await pool.query<OpportunityRow>(
      `SELECT ${selectColumns}
       FROM automation_opportunities
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR (title, id) > ($2::text, $3::uuid))
       ORDER BY title ASC, id ASC
       LIMIT $4`,
      [tenantId, pagination.after?.name ?? null, pagination.after?.id ?? null, pagination.limit + 1]
    );
    return { items: result.rows.slice(0, pagination.limit), hasMore: result.rows.length > pagination.limit };
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
          impact_estimate, evidence_refs, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'discovered')
        RETURNING ${selectColumns}`,
        [
          tenantId,
          input.departmentId ?? null,
          input.processId ?? null,
          input.title,
          input.problemStatement,
          input.proposedOutcome ?? null,
          JSON.stringify(input.impactEstimate ?? {}),
          JSON.stringify(input.evidenceRefs ?? [])
        ]
      );
      const opportunity = result.rows[0]!;
      await writeAuditEvent(client, tenantId, actorId, "automation_opportunity.created", opportunity, {
        title: opportunity.title,
        departmentId: opportunity.departmentId,
        processId: opportunity.processId,
        status: opportunity.status
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
      const currentResult = await client.query<{ status: string }>(
        "SELECT status FROM automation_opportunities WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [tenantId, id]
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return null;
      }

      if (
        input.status !== undefined &&
        (!opportunityStatuses.includes(current.status as OpportunityStatus) ||
          !canTransitionOpportunityStatus(current.status as OpportunityStatus, input.status))
      ) {
        throw new OpportunityStatusTransitionError(current.status, input.status);
      }

      const result = await client.query<OpportunityRow>(
        `UPDATE automation_opportunities SET
          department_id = CASE WHEN $3::boolean THEN $4::uuid ELSE department_id END,
          process_id = CASE WHEN $5::boolean THEN $6::uuid ELSE process_id END,
          title = COALESCE($7, title),
          problem_statement = COALESCE($8, problem_statement),
          proposed_outcome = CASE WHEN $9::boolean THEN $10::text ELSE proposed_outcome END,
          impact_estimate = CASE WHEN $11::boolean THEN $12::jsonb ELSE impact_estimate END,
          evidence_refs = CASE WHEN $13::boolean THEN $14::jsonb ELSE evidence_refs END,
          status = COALESCE($15, status)
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
        changedFields: Object.keys(input),
        previousStatus: current.status,
        nextStatus: opportunity.status
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

const stringArray = z.array(z.string().trim().min(1).max(512)).max(200);
const createOpportunitySchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  processId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  problemStatement: z.string().trim().min(5).max(4000),
  proposedOutcome: z.string().trim().max(2000).nullable().optional(),
  impactEstimate: z.record(z.string(), z.unknown()).optional(),
  evidenceRefs: stringArray.optional()
}).strict();

const updateOpportunitySchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  processId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200).optional(),
  problemStatement: z.string().trim().min(5).max(4000).optional(),
  proposedOutcome: z.string().trim().max(2000).nullable().optional(),
  impactEstimate: z.record(z.string(), z.unknown()).optional(),
  evidenceRefs: stringArray.optional(),
  status: z.enum(opportunityStatuses).optional()
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

function handleOpportunityError(error: unknown, response: Response): boolean {
  if (error instanceof OpportunityStatusTransitionError) {
    response.status(409).json({
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: error.message,
        details: { from: error.from, to: error.to }
      }
    });
    return true;
  }

  if ((error as { code?: string }).code === "23503") {
    response.status(400).json({
      error: { code: "INVALID_ASSOCIATION", message: "The selected department or process is not available in this tenant" }
    });
    return true;
  }

  return false;
}

function sendOpportunityPage(
  response: Response,
  page: Page<AutomationOpportunity>,
  pagination: PaginationOptions
): void {
  const lastItem = page.items.at(-1);
  response.json({
    data: page.items,
    pagination: {
      limit: pagination.limit,
      nextCursor: page.hasMore && lastItem
        ? encodePaginationCursor({ name: lastItem.title, id: lastItem.id })
        : null
    }
  });
}

export function createAutomationOpportunitiesRouter(repository: AutomationOpportunityRepository): ExpressRouter {
  const router = Router();

  router.get("/", requirePermission("opportunities:read"), async (request, response) => {
    const principal = currentPrincipal(request, response);
    if (!principal) return;
    const parsedPagination = parsePaginationQuery(request.query);
    if (!parsedPagination.success) return validationError(response, parsedPagination.message);
    const page = await repository.list(principal.tenantId, parsedPagination.data);
    sendOpportunityPage(response, page, parsedPagination.data);
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
      if (!handleOpportunityError(error, response)) throw error;
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
      if (!handleOpportunityError(error, response)) throw error;
    }
  });

  return router;
}
