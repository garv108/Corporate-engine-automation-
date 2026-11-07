import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requirePermission, type AuthenticatedPrincipal } from "../auth/auth.js";

export const interventionTypes = [
  "automation", "process_redesign", "policy_simplification", "training",
  "capacity_change", "data_quality", "other"
] as const;
export const interventionStatuses = ["proposed", "shortlisted", "selected", "rejected", "deferred"] as const;
export const opportunityEvidenceKinds = [
  "user_statement", "direct_observation", "approved_system_record",
  "external_document", "synthetic_fixture", "derived_calculation"
] as const;
export const opportunityEvidenceClassifications = [
  "unknown", "public", "internal", "confidential", "sensitive_workforce", "restricted"
] as const;
export const scoringMethodVersion = "CIAS-INTERVENTION-V1";

export type InterventionType = (typeof interventionTypes)[number];
export type InterventionStatus = (typeof interventionStatuses)[number];
export type OpportunityEvidence = {
  id: string; tenantId: string; opportunityId: string;
  sourceKind: (typeof opportunityEvidenceKinds)[number];
  claim: string; sourceLabel: string; sourceReference: string | null;
  sourceVersion: string | null; contentHash: string | null;
  classification: (typeof opportunityEvidenceClassifications)[number];
  observedAt: string | null; retrievedAt: string | null; recordedBy: string; recordedAt: string;
};
export type OpportunityIntervention = {
  id: string; tenantId: string; opportunityId: string; interventionType: InterventionType;
  title: string; description: string; assumptions: string[]; dependencies: string[];
  limitations: string[]; humanCheckpoints: string[]; status: InterventionStatus;
  createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
  latestAssessmentVersion: number | null; latestScore: number | null;
};
export type InterventionDimension = { score: number; rationale: string };
export type InterventionDimensions = {
  expectedImpact: InterventionDimension;
  feasibility: InterventionDimension;
  implementationEffort: InterventionDimension;
  operationalRisk: InterventionDimension;
  evidenceStrength: InterventionDimension;
};
export type OpportunityAssessment = {
  id: string; tenantId: string; opportunityId: string; interventionId: string;
  version: number; scoringMethodVersion: string; dimensionScores: InterventionDimensions;
  overallScore: number; rationale: string; assumptions: string[];
  expectedImpact: Record<string, unknown>; evidenceIds: string[];
  evaluatedBy: string; evaluatedAt: string;
};

export class InterventionStatusError extends Error {
  constructor(readonly from: string, readonly to: InterventionStatus) {
    super("Intervention status cannot transition from " + from + " to " + to);
  }
}
export class AssessmentEvidenceError extends Error {
  constructor() { super("Every assessment must reference one or more evidence records belonging to this opportunity."); }
}
export class InterventionStateError extends Error {
  constructor(readonly status: string) { super("An intervention in " + status + " state cannot be assessed."); }
}
export class OpportunityNotFoundError extends Error {
  constructor() { super("Opportunity not found"); }
}

const dimensionSchema = z.object({
  score: z.number().int().min(1).max(5),
  rationale: z.string().trim().min(10).max(1000)
}).strict();
const dimensionsSchema = z.object({
  expectedImpact: dimensionSchema,
  feasibility: dimensionSchema,
  implementationEffort: dimensionSchema,
  operationalRisk: dimensionSchema,
  evidenceStrength: dimensionSchema
}).strict();
const stringList = z.array(z.string().trim().min(1).max(1000)).max(100);
const evidenceInputSchema = z.object({
  sourceKind: z.enum(opportunityEvidenceKinds),
  claim: z.string().trim().min(5).max(4000),
  sourceLabel: z.string().trim().min(1).max(200),
  sourceReference: z.string().trim().max(2048).optional(),
  sourceVersion: z.string().trim().max(160).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  classification: z.enum(opportunityEvidenceClassifications).default("unknown"),
  observedAt: z.string().datetime({ offset: true }).optional(),
  retrievedAt: z.string().datetime({ offset: true }).optional()
}).strict();
const interventionInputSchema = z.object({
  interventionType: z.enum(interventionTypes),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(5).max(4000),
  assumptions: stringList.default([]),
  dependencies: stringList.default([]),
  limitations: stringList.default([]),
  humanCheckpoints: stringList.default([])
}).strict();
const interventionUpdateSchema = z.object({ status: z.enum(interventionStatuses) }).strict();
const expectedImpactSchema = z.object({
  lowerBound: z.number().finite().nonnegative().optional(),
  upperBound: z.number().finite().nonnegative().optional(),
  unit: z.string().trim().min(1).max(80).optional(),
  period: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(1000).optional()
}).strict().superRefine((value, context) => {
  const hasBound = value.lowerBound !== undefined || value.upperBound !== undefined;
  if (hasBound && (value.lowerBound === undefined || value.upperBound === undefined || !value.unit || !value.period)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "An impact range requires lowerBound, upperBound, unit and period." });
  }
  if (value.lowerBound !== undefined && value.upperBound !== undefined && value.lowerBound > value.upperBound) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "lowerBound cannot exceed upperBound." });
  }
});
const assessmentInputSchema = z.object({
  dimensionScores: dimensionsSchema,
  rationale: z.string().trim().min(10).max(4000),
  assumptions: stringList.default([]),
  expectedImpact: expectedImpactSchema.default({}),
  evidenceIds: z.array(z.string().uuid()).min(1).max(50)
}).strict().superRefine((value, context) => {
  if (new Set(value.evidenceIds).size !== value.evidenceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceIds"], message: "Evidence IDs must be unique." });
  }
});

export function calculateInterventionScore(dimensions: InterventionDimensions): number {
  const { expectedImpact, feasibility, implementationEffort, operationalRisk, evidenceStrength } = dimensions;
  const raw =
    expectedImpact.score * 0.30 +
    feasibility.score * 0.25 +
    (6 - implementationEffort.score) * 0.15 +
    (6 - operationalRisk.score) * 0.15 +
    evidenceStrength.score * 0.15;
  return Math.round((raw / 5) * 1000) / 10;
}

const interventionTransitions: Record<InterventionStatus, readonly InterventionStatus[]> = {
  proposed: ["shortlisted", "rejected", "deferred"],
  shortlisted: ["proposed", "selected", "rejected", "deferred"],
  selected: ["shortlisted", "rejected", "deferred"],
  rejected: [],
  deferred: []
};

async function audit(
  client: PoolClient, tenantId: string, actorId: string, action: string,
  resourceType: string, resourceId: string, metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    "INSERT INTO audit_events (tenant_id,actor_type,actor_id,action,resource_type,resource_id,decision,metadata) " +
    "VALUES ($1,'user',$2,$3,$4,$5,'allowed',$6::jsonb)",
    [tenantId, actorId, action, resourceType, resourceId, JSON.stringify(metadata)]
  );
}

async function assertOpportunity(client: PoolClient, tenantId: string, opportunityId: string): Promise<void> {
  const result = await client.query(
    "SELECT id FROM automation_opportunities WHERE tenant_id=$1 AND id=$2 FOR KEY SHARE",
    [tenantId, opportunityId]
  );
  if (!result.rowCount) throw new OpportunityNotFoundError();
}

export interface OpportunityIntelligenceRepository {
  listEvidence(tenantId: string, opportunityId: string): Promise<OpportunityEvidence[] | null>;
  createEvidence(tenantId: string, opportunityId: string, actorId: string, input: z.input<typeof evidenceInputSchema>): Promise<OpportunityEvidence>;
  listInterventions(tenantId: string, opportunityId: string): Promise<OpportunityIntervention[] | null>;
  createIntervention(tenantId: string, opportunityId: string, actorId: string, input: z.input<typeof interventionInputSchema>): Promise<OpportunityIntervention>;
  updateIntervention(tenantId: string, opportunityId: string, interventionId: string, actorId: string, status: InterventionStatus): Promise<OpportunityIntervention | null>;
  listAssessments(tenantId: string, opportunityId: string, interventionId: string): Promise<OpportunityAssessment[] | null>;
  createAssessment(tenantId: string, opportunityId: string, interventionId: string, actorId: string, input: z.input<typeof assessmentInputSchema>): Promise<OpportunityAssessment | null>;
}

export const postgresOpportunityIntelligenceRepository: OpportunityIntelligenceRepository = {
  async listEvidence(tenantId, opportunityId) {
    const opportunity = await pool.query("SELECT id FROM automation_opportunities WHERE tenant_id=$1 AND id=$2", [tenantId, opportunityId]);
    if (!opportunity.rowCount) return null;
    const result = await pool.query<OpportunityEvidence>(
      "SELECT id,tenant_id AS \"tenantId\",opportunity_id AS \"opportunityId\",source_kind AS \"sourceKind\",claim,source_label AS \"sourceLabel\",source_reference AS \"sourceReference\",source_version AS \"sourceVersion\",content_hash AS \"contentHash\",classification,observed_at AS \"observedAt\",retrieved_at AS \"retrievedAt\",recorded_by AS \"recordedBy\",recorded_at AS \"recordedAt\" " +
      "FROM opportunity_evidence WHERE tenant_id=$1 AND opportunity_id=$2 ORDER BY recorded_at DESC,id DESC",
      [tenantId, opportunityId]
    );
    return result.rows;
  },

  async createEvidence(tenantId, opportunityId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assertOpportunity(client, tenantId, opportunityId);
      const result = await client.query<OpportunityEvidence>(
        "INSERT INTO opportunity_evidence (tenant_id,opportunity_id,source_kind,claim,source_label,source_reference,source_version,content_hash,classification,observed_at,retrieved_at,recorded_by) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) " +
        "RETURNING id,tenant_id AS \"tenantId\",opportunity_id AS \"opportunityId\",source_kind AS \"sourceKind\",claim,source_label AS \"sourceLabel\",source_reference AS \"sourceReference\",source_version AS \"sourceVersion\",content_hash AS \"contentHash\",classification,observed_at AS \"observedAt\",retrieved_at AS \"retrievedAt\",recorded_by AS \"recordedBy\",recorded_at AS \"recordedAt\"",
        [tenantId, opportunityId, input.sourceKind, input.claim, input.sourceLabel, input.sourceReference ?? null,
          input.sourceVersion ?? null, input.contentHash?.toLowerCase() ?? null, input.classification ?? "unknown",
          input.observedAt ?? null, input.retrievedAt ?? null, actorId]
      );
      const evidence = result.rows[0]!;
      await audit(client, tenantId, actorId, "opportunity_evidence.created", "opportunity_evidence", evidence.id, { opportunityId, sourceKind: evidence.sourceKind, classification: evidence.classification });
      await client.query("COMMIT");
      return evidence;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  },

  async listInterventions(tenantId, opportunityId) {
    const opportunity = await pool.query("SELECT id FROM automation_opportunities WHERE tenant_id=$1 AND id=$2", [tenantId, opportunityId]);
    if (!opportunity.rowCount) return null;
    const result = await pool.query<OpportunityIntervention>(
      "SELECT i.id,i.tenant_id AS \"tenantId\",i.opportunity_id AS \"opportunityId\",i.intervention_type AS \"interventionType\",i.title,i.description,i.assumptions,i.dependencies,i.limitations,i.human_checkpoints AS \"humanCheckpoints\",i.status,i.created_by AS \"createdBy\",i.updated_by AS \"updatedBy\",i.created_at AS \"createdAt\",i.updated_at AS \"updatedAt\",latest.version AS \"latestAssessmentVersion\",latest.overall_score::float8 AS \"latestScore\" " +
      "FROM opportunity_interventions i LEFT JOIN LATERAL (SELECT version,overall_score FROM opportunity_intervention_assessments a WHERE a.tenant_id=i.tenant_id AND a.opportunity_id=i.opportunity_id AND a.intervention_id=i.id ORDER BY version DESC LIMIT 1) latest ON true " +
      "WHERE i.tenant_id=$1 AND i.opportunity_id=$2 ORDER BY i.created_at,i.id",
      [tenantId, opportunityId]
    );
    return result.rows;
  },

  async createIntervention(tenantId, opportunityId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assertOpportunity(client, tenantId, opportunityId);
      const result = await client.query<OpportunityIntervention>(
        "INSERT INTO opportunity_interventions (tenant_id,opportunity_id,intervention_type,title,description,assumptions,dependencies,limitations,human_checkpoints,created_by,updated_by) " +
        "VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$10) " +
        "RETURNING id,tenant_id AS \"tenantId\",opportunity_id AS \"opportunityId\",intervention_type AS \"interventionType\",title,description,assumptions,dependencies,limitations,human_checkpoints AS \"humanCheckpoints\",status,created_by AS \"createdBy\",updated_by AS \"updatedBy\",created_at AS \"createdAt\",updated_at AS \"updatedAt\",NULL::int AS \"latestAssessmentVersion\",NULL::numeric AS \"latestScore\"",
        [tenantId, opportunityId, input.interventionType, input.title, input.description, JSON.stringify(input.assumptions ?? []),
          JSON.stringify(input.dependencies ?? []), JSON.stringify(input.limitations ?? []), JSON.stringify(input.humanCheckpoints ?? []), actorId]
      );
      const intervention = result.rows[0]!;
      await audit(client, tenantId, actorId, "opportunity_intervention.created", "opportunity_intervention", intervention.id, {
        opportunityId, interventionType: intervention.interventionType, title: intervention.title
      });
      await client.query("COMMIT");
      return intervention;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  },

  async updateIntervention(tenantId, opportunityId, interventionId, actorId, status) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{ status: InterventionStatus }>(
        "SELECT status FROM opportunity_interventions WHERE tenant_id=$1 AND opportunity_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, opportunityId, interventionId]
      );
      if (!selected.rowCount) { await client.query("ROLLBACK"); return null; }
      const current = selected.rows[0]!.status;
      if (current !== status && !interventionTransitions[current].includes(status)) throw new InterventionStatusError(current, status);
      const updated = await client.query<OpportunityIntervention>(
        "UPDATE opportunity_interventions SET status=$4,updated_by=$5,updated_at=now() WHERE tenant_id=$1 AND opportunity_id=$2 AND id=$3 " +
        "RETURNING id,tenant_id AS \"tenantId\",opportunity_id AS \"opportunityId\",intervention_type AS \"interventionType\",title,description,assumptions,dependencies,limitations,human_checkpoints AS \"humanCheckpoints\",status,created_by AS \"createdBy\",updated_by AS \"updatedBy\",created_at AS \"createdAt\",updated_at AS \"updatedAt\",NULL::int AS \"latestAssessmentVersion\",NULL::numeric AS \"latestScore\"",
        [tenantId, opportunityId, interventionId, status, actorId]
      );
      const item = updated.rows[0]!;
      await audit(client, tenantId, actorId, "opportunity_intervention.status_changed", "opportunity_intervention", interventionId, { previousStatus: current, nextStatus: status });
      await client.query("COMMIT");
      return item;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  },

  async listAssessments(tenantId, opportunityId, interventionId) {
    const intervention = await pool.query(
      "SELECT id FROM opportunity_interventions WHERE tenant_id=$1 AND opportunity_id=$2 AND id=$3",
      [tenantId, opportunityId, interventionId]
    );
    if (!intervention.rowCount) return null;
    const result = await pool.query<OpportunityAssessment>(
      "SELECT a.id,a.tenant_id AS \"tenantId\",a.opportunity_id AS \"opportunityId\",a.intervention_id AS \"interventionId\",a.version,a.scoring_method_version AS \"scoringMethodVersion\",a.dimension_scores AS \"dimensionScores\",a.overall_score::float8 AS \"overallScore\",a.rationale,a.assumptions,a.expected_impact AS \"expectedImpact\",COALESCE(array_agg(e.evidence_id) FILTER (WHERE e.evidence_id IS NOT NULL),'{}') AS \"evidenceIds\",a.evaluated_by AS \"evaluatedBy\",a.evaluated_at AS \"evaluatedAt\" " +
      "FROM opportunity_intervention_assessments a LEFT JOIN opportunity_assessment_evidence e ON e.tenant_id=a.tenant_id AND e.assessment_id=a.id " +
      "WHERE a.tenant_id=$1 AND a.opportunity_id=$2 AND a.intervention_id=$3 " +
      "GROUP BY a.id ORDER BY a.version DESC",
      [tenantId, opportunityId, interventionId]
    );
    return result.rows;
  },

  async createAssessment(tenantId, opportunityId, interventionId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{ status: InterventionStatus }>(
        "SELECT status FROM opportunity_interventions WHERE tenant_id=$1 AND opportunity_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, opportunityId, interventionId]
      );
      if (!selected.rowCount) { await client.query("ROLLBACK"); return null; }
      if (["rejected", "deferred"].includes(selected.rows[0]!.status)) throw new InterventionStateError(selected.rows[0]!.status);
      const evidence = await client.query(
        "SELECT id FROM opportunity_evidence WHERE tenant_id=$1 AND opportunity_id=$2 AND id=ANY($3::uuid[])",
        [tenantId, opportunityId, input.evidenceIds]
      );
      if (evidence.rowCount !== input.evidenceIds.length) throw new AssessmentEvidenceError();
      const versionResult = await client.query<{ version: number }>(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM opportunity_intervention_assessments WHERE tenant_id=$1 AND opportunity_id=$2 AND intervention_id=$3",
        [tenantId, opportunityId, interventionId]
      );
      const version = versionResult.rows[0]!.version;
      const overallScore = calculateInterventionScore(input.dimensionScores);
      const inserted = await client.query<{ id: string; evaluatedAt: string }>(
        "INSERT INTO opportunity_intervention_assessments (tenant_id,opportunity_id,intervention_id,version,scoring_method_version,dimension_scores,overall_score,rationale,assumptions,expected_impact,evaluated_by) " +
        "VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10::jsonb,$11) RETURNING id,evaluated_at AS \"evaluatedAt\"",
        [tenantId, opportunityId, interventionId, version, scoringMethodVersion, JSON.stringify(input.dimensionScores),
          overallScore, input.rationale, JSON.stringify(input.assumptions ?? []), JSON.stringify(input.expectedImpact ?? {}), actorId]
      );
      for (const evidenceId of input.evidenceIds) {
        await client.query(
          "INSERT INTO opportunity_assessment_evidence (tenant_id,opportunity_id,intervention_id,assessment_id,evidence_id,linked_by) VALUES ($1,$2,$3,$4,$5,$6)",
          [tenantId, opportunityId, interventionId, inserted.rows[0]!.id, evidenceId, actorId]
        );
      }
      await audit(client, tenantId, actorId, "opportunity_intervention.assessed", "opportunity_intervention_assessment", inserted.rows[0]!.id, {
        opportunityId, interventionId, version, scoringMethodVersion, overallScore, evidenceIds: input.evidenceIds
      });
      await client.query("COMMIT");
      return {
        id: inserted.rows[0]!.id, tenantId, opportunityId, interventionId, version,
        scoringMethodVersion, dimensionScores: input.dimensionScores, overallScore,
        rationale: input.rationale, assumptions: input.assumptions ?? [], expectedImpact: input.expectedImpact ?? {},
        evidenceIds: input.evidenceIds, evaluatedBy: actorId, evaluatedAt: inserted.rows[0]!.evaluatedAt
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
};

function currentPrincipal(request: Request, response: Response): AuthenticatedPrincipal | null {
  if (!request.principal) {
    response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } });
    return null;
  }
  return request.principal;
}
function invalid(response: Response, message: string): void {
  response.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}
function handleIntelligenceError(error: unknown, response: Response): boolean {
  if (error instanceof OpportunityNotFoundError) {
    response.status(404).json({ error: { code: "NOT_FOUND", message: error.message } }); return true;
  }
  if (error instanceof InterventionStatusError) {
    response.status(409).json({ error: { code: "INVALID_INTERVENTION_TRANSITION", message: error.message } }); return true;
  }
  if (error instanceof InterventionStateError) {
    response.status(409).json({ error: { code: "INTERVENTION_NOT_ASSESSABLE", message: error.message } }); return true;
  }
  if (error instanceof AssessmentEvidenceError) {
    response.status(400).json({ error: { code: "INVALID_ASSESSMENT_EVIDENCE", message: error.message } }); return true;
  }
  if ((error as { code?: string }).code === "23505") {
    response.status(409).json({ error: { code: "INTERVENTION_ALREADY_SELECTED", message: "Only one intervention can be selected per opportunity." } }); return true;
  }
  return false;
}

const uuidSchema = z.string().uuid();
export function createOpportunityIntelligenceRouter(
  repository: OpportunityIntelligenceRepository = postgresOpportunityIntelligenceRepository
): ExpressRouter {
  const router = Router({ mergeParams: true });
  const opportunityIdFrom = (request: Request, response: Response): string | null => {
    const parsed = uuidSchema.safeParse(request.params.opportunityId);
    if (!parsed.success) { invalid(response, "Opportunity ID must be a UUID"); return null; }
    return parsed.data;
  };
  const interventionIdFrom = (request: Request, response: Response): string | null => {
    const parsed = uuidSchema.safeParse(request.params.interventionId);
    if (!parsed.success) { invalid(response, "Intervention ID must be a UUID"); return null; }
    return parsed.data;
  };

  router.get("/evidence", requirePermission("opportunities:read"), async (request, response) => {
    const principal = currentPrincipal(request, response); if (!principal) return;
    const opportunityId = opportunityIdFrom(request, response); if (!opportunityId) return;
    const items = await repository.listEvidence(principal.tenantId, opportunityId);
    if (!items) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
    response.json({ data: items });
  });
  router.post("/evidence", requirePermission("opportunities:evidence:create"), async (request, response) => {
    const principal = currentPrincipal(request, response); if (!principal) return;
    const opportunityId = opportunityIdFrom(request, response); if (!opportunityId) return;
    const parsed = evidenceInputSchema.safeParse(request.body);
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid evidence payload");
    try {
      const evidence = await repository.createEvidence(principal.tenantId, opportunityId, principal.subject, parsed.data);
      response.status(201).json({ data: evidence });
    } catch (error) { if (!handleIntelligenceError(error, response)) throw error; }
  });

  router.get("/interventions", requirePermission("opportunities:read"), async (request, response) => {
    const principal = currentPrincipal(request, response); if (!principal) return;
    const opportunityId = opportunityIdFrom(request, response); if (!opportunityId) return;
    const items = await repository.listInterventions(principal.tenantId, opportunityId);
    if (!items) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
    response.json({ data: items });
  });
  router.post("/interventions", requirePermission("opportunities:interventions:create"), async (request, response) => {
    const principal = currentPrincipal(request, response); if (!principal) return;
    const opportunityId = opportunityIdFrom(request, response); if (!opportunityId) return;
    const parsed = interventionInputSchema.safeParse(request.body);
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid intervention payload");
    try {
      const item = await repository.createIntervention(principal.tenantId, opportunityId, principal.subject, parsed.data);
      response.status(201).json({ data: item });
    } catch (error) { if (!handleIntelligenceError(error, response)) throw error; }
  });
  router.patch("/interventions/:interventionId", requirePermission("opportunities:interventions:update"), async (request, response) => {
    const principal = currentPrincipal(request, response); if (!principal) return;
    const opportunityId = opportunityIdFrom(request, response); if (!opportunityId) return;
    const interventionId = interventionIdFrom(request, response); if (!interventionId) return;
    const parsed = interventionUpdateSchema.safeParse(request.body);
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid intervention update");
    try {
      const item = await repository.updateIntervention(principal.tenantId, opportunityId, interventionId, principal.subject, parsed.data.status);
      if (!item) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Intervention not found" } });
      response.json({ data: item });
    } catch (error) { if (!handleIntelligenceError(error, response)) throw error; }
  });

  router.get("/interventions/:interventionId/assessments", requirePermission("opportunities:read"), async (request, response) => {
    const principal = currentPrincipal(request, response); if (!principal) return;
    const opportunityId = opportunityIdFrom(request, response); if (!opportunityId) return;
    const interventionId = interventionIdFrom(request, response); if (!interventionId) return;
    const items = await repository.listAssessments(principal.tenantId, opportunityId, interventionId);
    if (!items) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Intervention not found" } });
    response.json({ data: items });
  });
  router.post("/interventions/:interventionId/assessments", requirePermission("opportunities:assess"), async (request, response) => {
    const principal = currentPrincipal(request, response); if (!principal) return;
    const opportunityId = opportunityIdFrom(request, response); if (!opportunityId) return;
    const interventionId = interventionIdFrom(request, response); if (!interventionId) return;
    const parsed = assessmentInputSchema.safeParse(request.body);
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid assessment payload");
    try {
      const item = await repository.createAssessment(principal.tenantId, opportunityId, interventionId, principal.subject, parsed.data);
      if (!item) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Intervention not found" } });
      response.status(201).json({ data: item });
    } catch (error) { if (!handleIntelligenceError(error, response)) throw error; }
  });
  return router;
}
