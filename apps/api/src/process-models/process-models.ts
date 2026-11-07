import { createHash } from "node:crypto";
import { Router, type Router as ExpressRouter, type Response } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requirePermission } from "../auth/auth.js";

const modelStatuses = ["draft", "confirmed", "published"] as const;
const stepKinds = ["start", "end", "activity", "decision", "event", "handoff", "subprocess"] as const;
const participantKinds = ["person", "role", "team", "system", "external_party", "unknown"] as const;
const transitionKinds = ["sequence", "conditional", "exception", "default", "parallel"] as const;
const provenanceKinds = [
  "user_statement",
  "direct_observation",
  "approved_system_record",
  "external_document",
  "ai_hypothesis",
  "synthetic_fixture",
  "derived_calculation"
] as const;
const evidenceKinds = [
  "user_input",
  "direct_observation",
  "system_record",
  "external_document",
  "synthetic_fixture",
  "derived_calculation"
] as const;
const classifications = ["unknown", "public", "internal", "confidential", "sensitive_workforce", "restricted"] as const;
const reviewStates = ["unreviewed", "user_confirmed", "verified", "disputed", "rejected"] as const;

const keySchema = z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const dataDescriptorSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  dataType: z.string().trim().max(80).optional(),
  classification: z.enum(classifications).optional()
}).strict();

const ruleSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  condition: z.string().trim().max(1000).optional()
}).strict();

const participantSchema = z.object({
  kind: z.enum(participantKinds),
  label: z.string().trim().min(1).max(160).optional(),
  reference: z.string().trim().min(1).max(255).optional()
}).strict();

const stepSchema = z.object({
  key: keySchema,
  kind: z.enum(stepKinds),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  participant: participantSchema.nullable().optional(),
  systems: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  inputs: z.array(dataDescriptorSchema).max(100).default([]),
  outputs: z.array(dataDescriptorSchema).max(100).default([]),
  rules: z.array(ruleSchema).max(100).default([]),
  exceptions: z.array(ruleSchema).max(100).default([]),
  humanJudgement: z.string().trim().max(2000).optional(),
  layout: z.object({
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-100000).max(100000)
  }).strict().optional()
}).strict();

const transitionSchema = z.object({
  fromStepKey: keySchema,
  toStepKey: keySchema,
  kind: z.enum(transitionKinds).default("sequence"),
  label: z.string().trim().max(160).optional(),
  condition: z.string().trim().max(1000).optional()
}).strict();

const evidenceSchema = z.object({
  key: keySchema,
  sourceKind: z.enum(evidenceKinds),
  sourceLabel: z.string().trim().min(1).max(200),
  sourceReference: z.string().trim().max(2048).optional(),
  sourceVersion: z.string().trim().max(160).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  license: z.string().trim().max(300).optional(),
  classification: z.enum(classifications).default("unknown"),
  observedAt: z.string().datetime({ offset: true }).optional(),
  retrievedAt: z.string().datetime({ offset: true }).optional()
}).strict();

const factSchema = z.object({
  fieldPath: z.string().trim().min(1).max(256),
  value: z.unknown().refine((value) => value !== undefined, "Fact value is required"),
  provenanceKind: z.enum(provenanceKinds),
  stepKey: keySchema.optional(),
  evidenceKey: keySchema.optional()
}).strict();

export const processModelInputSchema = z.object({
  purpose: z.string().trim().max(2000).optional(),
  scope: z.string().trim().max(2000).optional(),
  trigger: z.string().trim().max(1000).optional(),
  expectedOutcome: z.string().trim().max(2000).optional(),
  steps: z.array(stepSchema).min(1).max(200),
  transitions: z.array(transitionSchema).max(400).default([]),
  evidence: z.array(evidenceSchema).max(200).default([]),
  facts: z.array(factSchema).max(500).default([])
}).strict().superRefine((value, context) => {
  const stepKeys = new Set<string>();
  for (const [index, step] of value.steps.entries()) {
    if (stepKeys.has(step.key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["steps", index, "key"], message: "Step keys must be unique within a model" });
    }
    stepKeys.add(step.key);
  }

  const evidenceKeys = new Set<string>();
  for (const [index, evidence] of value.evidence.entries()) {
    if (evidenceKeys.has(evidence.key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidence", index, "key"], message: "Evidence keys must be unique within a model" });
    }
    evidenceKeys.add(evidence.key);
  }

  for (const [index, transition] of value.transitions.entries()) {
    if (!stepKeys.has(transition.fromStepKey) || !stepKeys.has(transition.toStepKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transitions", index],
        message: "Every transition must reference steps in this model version"
      });
    }
  }

  for (const [index, fact] of value.facts.entries()) {
    if (fact.stepKey && !stepKeys.has(fact.stepKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["facts", index, "stepKey"], message: "Fact stepKey must reference a step in this model version" });
    }
    if (fact.evidenceKey && !evidenceKeys.has(fact.evidenceKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["facts", index, "evidenceKey"], message: "Fact evidenceKey must reference evidence in this model version" });
    }
  }
});

export type ProcessModelInput = z.infer<typeof processModelInputSchema>;
export type ProcessModelStatus = (typeof modelStatuses)[number];
export type ProcessModelReviewState = (typeof reviewStates)[number];

export type ProcessModelFact = {
  id: string;
  fieldPath: string;
  value: unknown;
  provenanceKind: (typeof provenanceKinds)[number];
  reviewState: ProcessModelReviewState;
  stepId: string | null;
  evidenceId: string | null;
  recordedBy: string;
  recordedAt: string;
};

export type ProcessModelEvidence = {
  id: string;
  sourceKind: (typeof evidenceKinds)[number];
  sourceLabel: string;
  sourceReference: string | null;
  sourceVersion: string | null;
  contentHash: string | null;
  license: string | null;
  classification: (typeof classifications)[number];
  observedAt: string | null;
  retrievedAt: string | null;
  recordedBy: string;
  recordedAt: string;
};

export type ProcessModelStep = ProcessModelInput["steps"][number] & {
  id: string;
  participant: ProcessModelInput["steps"][number]["participant"] | null;
};

export type ProcessModelTransition = ProcessModelInput["transitions"][number] & {
  id: string;
  fromStepId: string;
  toStepId: string;
};

export type ProcessModel = {
  id: string;
  tenantId: string;
  processId: string;
  version: number;
  status: ProcessModelStatus;
  purpose: string | null;
  scope: string | null;
  trigger: string | null;
  expectedOutcome: string | null;
  schemaVersion: number;
  contentHash: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  steps: ProcessModelStep[];
  transitions: ProcessModelTransition[];
  evidence: ProcessModelEvidence[];
  facts: ProcessModelFact[];
};

export type ProcessModelSummary = Pick<ProcessModel,
  "id" | "processId" | "version" | "status" | "purpose" | "expectedOutcome" |
  "contentHash" | "confirmedAt" | "publishedAt" | "createdAt" | "updatedAt"
>;

export class ProcessModelStateError extends Error {
  constructor(readonly currentState: string, readonly requestedAction: string) {
    super("Cannot " + requestedAction + " a process model while it is " + currentState);
    this.name = "ProcessModelStateError";
  }
}

type ModelRow = {
  id: string;
  tenantId: string;
  processId: string;
  version: number;
  status: ProcessModelStatus;
  purpose: string | null;
  scope: string | null;
  trigger: string | null;
  expectedOutcome: string | null;
  schemaVersion: number;
  contentHash: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => JSON.stringify(key) + ":" + stableJson(record[key])).join(",") + "}";
}

function contentDigest(input: ProcessModelInput): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

async function writeAuditEvent(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  action: string,
  modelId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    "INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata) " +
    "VALUES ($1, 'user', $2, $3, 'business_process_model_version', $4, 'allowed', $5::jsonb)",
    [tenantId, actorId, action, modelId, JSON.stringify(metadata)]
  );
}

async function saveChildren(
  client: PoolClient,
  tenantId: string,
  modelId: string,
  actorId: string,
  input: ProcessModelInput
): Promise<void> {
  const evidenceIds = new Map<string, string>();
  for (const evidence of input.evidence) {
    const result = await client.query<{ id: string }>(
      "INSERT INTO business_process_model_evidence " +
      "(tenant_id, model_version_id, source_kind, source_label, source_reference, source_version, content_hash, license, classification, observed_at, retrieved_at, recorded_by) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
      [
        tenantId, modelId, evidence.sourceKind, evidence.sourceLabel, evidence.sourceReference ?? null,
        evidence.sourceVersion ?? null, evidence.contentHash?.toLowerCase() ?? null, evidence.license ?? null,
        evidence.classification, evidence.observedAt ?? null, evidence.retrievedAt ?? null, actorId
      ]
    );
    evidenceIds.set(evidence.key, result.rows[0]!.id);
  }

  const stepIds = new Map<string, string>();
  for (const step of input.steps) {
    const participant = step.participant ?? null;
    const result = await client.query<{ id: string }>(
      "INSERT INTO business_process_model_steps " +
      "(tenant_id, model_version_id, step_key, kind, name, description, participant_kind, participant_label, participant_reference, systems, inputs, outputs, rules, exceptions, human_judgement, layout, attributes_schema_version) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16::jsonb,1) RETURNING id",
      [
        tenantId, modelId, step.key, step.kind, step.name, step.description ?? null,
        participant?.kind ?? null, participant?.label ?? null, participant?.reference ?? null,
        JSON.stringify(step.systems), JSON.stringify(step.inputs), JSON.stringify(step.outputs),
        JSON.stringify(step.rules), JSON.stringify(step.exceptions), step.humanJudgement ?? null,
        step.layout ? JSON.stringify(step.layout) : null
      ]
    );
    stepIds.set(step.key, result.rows[0]!.id);
  }

  for (const transition of input.transitions) {
    await client.query(
      "INSERT INTO business_process_model_transitions " +
      "(tenant_id, model_version_id, from_step_id, to_step_id, kind, label, condition) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        tenantId, modelId, stepIds.get(transition.fromStepKey), stepIds.get(transition.toStepKey),
        transition.kind, transition.label ?? null, transition.condition ?? null
      ]
    );
  }

  for (const fact of input.facts) {
    await client.query(
      "INSERT INTO business_process_model_facts " +
      "(tenant_id, model_version_id, step_id, evidence_id, field_path, value, provenance_kind, review_state, recorded_by) " +
      "VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'unreviewed',$8)",
      [
        tenantId, modelId, fact.stepKey ? stepIds.get(fact.stepKey) : null,
        fact.evidenceKey ? evidenceIds.get(fact.evidenceKey) : null,
        fact.fieldPath, JSON.stringify(fact.value), fact.provenanceKind, actorId
      ]
    );
  }
}

async function loadModel(
  client: PoolClient,
  tenantId: string,
  processId: string,
  modelId: string
): Promise<ProcessModel | null> {
  const modelResult = await client.query<ModelRow>(
    "SELECT id, tenant_id AS \"tenantId\", process_id AS \"processId\", version, status, purpose, scope, " +
    "trigger_definition AS trigger, expected_outcome AS \"expectedOutcome\", schema_version AS \"schemaVersion\", " +
    "content_hash AS \"contentHash\", confirmed_by AS \"confirmedBy\", confirmed_at AS \"confirmedAt\", " +
    "published_by AS \"publishedBy\", published_at AS \"publishedAt\", created_by AS \"createdBy\", " +
    "updated_by AS \"updatedBy\", created_at AS \"createdAt\", updated_at AS \"updatedAt\" " +
    "FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2 AND id=$3",
    [tenantId, processId, modelId]
  );
  const model = modelResult.rows[0];
  if (!model) return null;

  const [stepResult, transitionResult, evidenceResult, factResult] = await Promise.all([
    client.query(
      "SELECT id, step_key AS \"key\", kind, name, description, participant_kind AS \"participantKind\", " +
      "participant_label AS \"participantLabel\", participant_reference AS \"participantReference\", systems, inputs, outputs, rules, exceptions, " +
      "human_judgement AS \"humanJudgement\", layout FROM business_process_model_steps " +
      "WHERE tenant_id=$1 AND model_version_id=$2 ORDER BY step_key",
      [tenantId, modelId]
    ),
    client.query(
      "SELECT t.id, t.kind, t.label, t.condition, f.step_key AS \"fromStepKey\", " +
      "to_step.step_key AS \"toStepKey\", t.from_step_id AS \"fromStepId\", t.to_step_id AS \"toStepId\" " +
      "FROM business_process_model_transitions t " +
      "JOIN business_process_model_steps f ON f.tenant_id=t.tenant_id AND f.model_version_id=t.model_version_id AND f.id=t.from_step_id " +
      "JOIN business_process_model_steps to_step ON to_step.tenant_id=t.tenant_id AND to_step.model_version_id=t.model_version_id AND to_step.id=t.to_step_id " +
      "WHERE t.tenant_id=$1 AND t.model_version_id=$2 ORDER BY t.id",
      [tenantId, modelId]
    ),
    client.query(
      "SELECT id, source_kind AS \"sourceKind\", source_label AS \"sourceLabel\", source_reference AS \"sourceReference\", " +
      "source_version AS \"sourceVersion\", content_hash AS \"contentHash\", license, classification, " +
      "observed_at AS \"observedAt\", retrieved_at AS \"retrievedAt\", recorded_by AS \"recordedBy\", recorded_at AS \"recordedAt\" " +
      "FROM business_process_model_evidence WHERE tenant_id=$1 AND model_version_id=$2 ORDER BY id",
      [tenantId, modelId]
    ),
    client.query(
      "SELECT id, field_path AS \"fieldPath\", value, provenance_kind AS \"provenanceKind\", review_state AS \"reviewState\", " +
      "step_id AS \"stepId\", evidence_id AS \"evidenceId\", recorded_by AS \"recordedBy\", recorded_at AS \"recordedAt\" " +
      "FROM business_process_model_facts WHERE tenant_id=$1 AND model_version_id=$2 ORDER BY id",
      [tenantId, modelId]
    )
  ]);

  const steps: ProcessModelStep[] = stepResult.rows.map((row: any) => ({
    id: row.id,
    key: row.key,
    kind: row.kind,
    name: row.name,
    description: row.description ?? undefined,
    participant: row.participantKind
      ? { kind: row.participantKind, label: row.participantLabel ?? undefined, reference: row.participantReference ?? undefined }
      : null,
    systems: row.systems,
    inputs: row.inputs,
    outputs: row.outputs,
    rules: row.rules,
    exceptions: row.exceptions,
    humanJudgement: row.humanJudgement ?? undefined,
    layout: row.layout ?? undefined
  }));

  const transitions: ProcessModelTransition[] = transitionResult.rows.map((row: any) => ({
    id: row.id,
    fromStepId: row.fromStepId,
    toStepId: row.toStepId,
    fromStepKey: row.fromStepKey,
    toStepKey: row.toStepKey,
    kind: row.kind,
    label: row.label ?? undefined,
    condition: row.condition ?? undefined
  }));

  const evidence: ProcessModelEvidence[] = evidenceResult.rows.map((row: any) => ({
    id: row.id,
    sourceKind: row.sourceKind,
    sourceLabel: row.sourceLabel,
    sourceReference: row.sourceReference,
    sourceVersion: row.sourceVersion,
    contentHash: row.contentHash,
    license: row.license,
    classification: row.classification,
    observedAt: row.observedAt,
    retrievedAt: row.retrievedAt,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt
  }));

  const facts: ProcessModelFact[] = factResult.rows.map((row: any) => ({
    id: row.id,
    fieldPath: row.fieldPath,
    value: row.value,
    provenanceKind: row.provenanceKind,
    reviewState: row.reviewState,
    stepId: row.stepId,
    evidenceId: row.evidenceId,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt
  }));

  return { ...model, steps, transitions, evidence, facts };
}

export interface ProcessModelRepository {
  list(tenantId: string, processId: string): Promise<ProcessModelSummary[] | null>;
  get(tenantId: string, processId: string, modelId: string): Promise<ProcessModel | null>;
  create(tenantId: string, processId: string, actorId: string, input: ProcessModelInput): Promise<ProcessModel | null>;
  update(tenantId: string, processId: string, modelId: string, actorId: string, input: ProcessModelInput): Promise<ProcessModel | null>;
  confirm(tenantId: string, processId: string, modelId: string, actorId: string): Promise<ProcessModel | null>;
  publish(tenantId: string, processId: string, modelId: string, actorId: string): Promise<ProcessModel | null>;
  reviewFact(tenantId: string, processId: string, modelId: string, factId: string, actorId: string, state: Exclude<ProcessModelReviewState, "unreviewed">): Promise<ProcessModelFact | null>;
}

export const postgresProcessModelRepository: ProcessModelRepository = {
  async list(tenantId, processId) {
    const process = await pool.query(
      "SELECT id FROM business_processes WHERE tenant_id=$1 AND id=$2",
      [tenantId, processId]
    );
    if (!process.rowCount) return null;
    const result = await pool.query<ProcessModelSummary>(
      "SELECT id, process_id AS \"processId\", version, status, purpose, expected_outcome AS \"expectedOutcome\", " +
      "content_hash AS \"contentHash\", confirmed_at AS \"confirmedAt\", published_at AS \"publishedAt\", " +
      "created_at AS \"createdAt\", updated_at AS \"updatedAt\" " +
      "FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2 ORDER BY version DESC",
      [tenantId, processId]
    );
    return result.rows;
  },

  async get(tenantId, processId, modelId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const model = await loadModel(client, tenantId, processId, modelId);
      await client.query("COMMIT");
      return model;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async create(tenantId, processId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const process = await client.query(
        "SELECT id FROM business_processes WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [tenantId, processId]
      );
      if (!process.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const versionResult = await client.query<{ nextVersion: number }>(
        "SELECT COALESCE(MAX(version), 0) + 1 AS \"nextVersion\" FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2",
        [tenantId, processId]
      );
      const version = versionResult.rows[0]!.nextVersion;
      const inserted = await client.query<{ id: string }>(
        "INSERT INTO business_process_model_versions " +
        "(tenant_id, process_id, version, status, purpose, scope, trigger_definition, expected_outcome, schema_version, content_hash, created_by, updated_by) " +
        "VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,1,$8,$9,$9) RETURNING id",
        [tenantId, processId, version, input.purpose ?? null, input.scope ?? null, input.trigger ?? null,
          input.expectedOutcome ?? null, contentDigest(input), actorId]
      );
      const modelId = inserted.rows[0]!.id;
      await saveChildren(client, tenantId, modelId, actorId, input);
      await writeAuditEvent(client, tenantId, actorId, "business_process_model.created", modelId, { processId, version });
      const model = await loadModel(client, tenantId, processId, modelId);
      await client.query("COMMIT");
      return model;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async update(tenantId, processId, modelId, actorId, input) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: ProcessModelStatus }>(
        "SELECT status FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, processId, modelId]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      if (current.rows[0]!.status !== "draft") throw new ProcessModelStateError(current.rows[0]!.status, "update");
      await client.query(
        "UPDATE business_process_model_versions SET purpose=$4, scope=$5, trigger_definition=$6, expected_outcome=$7, content_hash=$8, updated_by=$9, updated_at=now() " +
        "WHERE tenant_id=$1 AND process_id=$2 AND id=$3",
        [tenantId, processId, modelId, input.purpose ?? null, input.scope ?? null, input.trigger ?? null,
          input.expectedOutcome ?? null, contentDigest(input), actorId]
      );
      await client.query("DELETE FROM business_process_model_facts WHERE tenant_id=$1 AND model_version_id=$2", [tenantId, modelId]);
      await client.query("DELETE FROM business_process_model_transitions WHERE tenant_id=$1 AND model_version_id=$2", [tenantId, modelId]);
      await client.query("DELETE FROM business_process_model_steps WHERE tenant_id=$1 AND model_version_id=$2", [tenantId, modelId]);
      await client.query("DELETE FROM business_process_model_evidence WHERE tenant_id=$1 AND model_version_id=$2", [tenantId, modelId]);
      await saveChildren(client, tenantId, modelId, actorId, input);
      await writeAuditEvent(client, tenantId, actorId, "business_process_model.updated", modelId, { changedFields: ["model"] });
      const model = await loadModel(client, tenantId, processId, modelId);
      await client.query("COMMIT");
      return model;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async confirm(tenantId, processId, modelId, actorId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: ProcessModelStatus }>(
        "SELECT status FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, processId, modelId]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      if (current.rows[0]!.status !== "draft") throw new ProcessModelStateError(current.rows[0]!.status, "confirm");
      await client.query(
        "UPDATE business_process_model_facts SET review_state='user_confirmed' " +
        "WHERE tenant_id=$1 AND model_version_id=$2 AND provenance_kind='user_statement' AND review_state='unreviewed'",
        [tenantId, modelId]
      );
      await client.query(
        "UPDATE business_process_model_versions SET status='confirmed', confirmed_by=$4, confirmed_at=now(), updated_by=$4, updated_at=now() " +
        "WHERE tenant_id=$1 AND process_id=$2 AND id=$3",
        [tenantId, processId, modelId, actorId]
      );
      await writeAuditEvent(client, tenantId, actorId, "business_process_model.confirmed", modelId, { processId });
      const model = await loadModel(client, tenantId, processId, modelId);
      await client.query("COMMIT");
      return model;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async publish(tenantId, processId, modelId, actorId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: ProcessModelStatus }>(
        "SELECT status FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, processId, modelId]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      if (current.rows[0]!.status !== "confirmed") throw new ProcessModelStateError(current.rows[0]!.status, "publish");
      await client.query(
        "UPDATE business_process_model_versions SET status='published', published_by=$4, published_at=now(), updated_by=$4, updated_at=now() " +
        "WHERE tenant_id=$1 AND process_id=$2 AND id=$3",
        [tenantId, processId, modelId, actorId]
      );
      await writeAuditEvent(client, tenantId, actorId, "business_process_model.published", modelId, { processId });
      const model = await loadModel(client, tenantId, processId, modelId);
      await client.query("COMMIT");
      return model;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async reviewFact(tenantId, processId, modelId, factId, actorId, state) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: ProcessModelStatus }>(
        "SELECT status FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2 AND id=$3 FOR UPDATE",
        [tenantId, processId, modelId]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      if (current.rows[0]!.status !== "draft") throw new ProcessModelStateError(current.rows[0]!.status, "review facts for");
      const updated = await client.query(
        "UPDATE business_process_model_facts SET review_state=$5 " +
        "WHERE tenant_id=$1 AND model_version_id=$2 AND id=$3 " +
        "RETURNING id, field_path AS \"fieldPath\", value, provenance_kind AS \"provenanceKind\", review_state AS \"reviewState\", " +
        "step_id AS \"stepId\", evidence_id AS \"evidenceId\", recorded_by AS \"recordedBy\", recorded_at AS \"recordedAt\"",
        [tenantId, modelId, factId, state]
      );
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      await writeAuditEvent(client, tenantId, actorId, "business_process_model.fact_reviewed", modelId, {
        factId, reviewState: state
      });
      await client.query("COMMIT");
      const row: any = updated.rows[0];
      return {
        id: row.id, fieldPath: row.fieldPath, value: row.value, provenanceKind: row.provenanceKind,
        reviewState: row.reviewState, stepId: row.stepId, evidenceId: row.evidenceId,
        recordedBy: row.recordedBy, recordedAt: row.recordedAt
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};

const uuidSchema = z.string().uuid();
const reviewInputSchema = z.object({
  reviewState: z.enum(["user_confirmed", "verified", "disputed", "rejected"])
}).strict();

function invalid(response: Response, message: string): void {
  response.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function handleModelError(error: unknown, response: any): boolean {
  if (error instanceof ProcessModelStateError) {
    response.status(409).json({ error: { code: "INVALID_MODEL_STATE", message: error.message } });
    return true;
  }
  const code = (error as { code?: string })?.code;
  if (code === "23503") {
    response.status(400).json({ error: { code: "INVALID_MODEL_REFERENCE", message: "A referenced process, step or evidence record is not available in this tenant and model version" } });
    return true;
  }
  return false;
}

export function createProcessModelsRouter(repository: ProcessModelRepository = postgresProcessModelRepository): ExpressRouter {
  const router = Router({ mergeParams: true });

  router.get("/", requirePermission("business_process_models:read"), async (request, response) => {
    const processId = uuidSchema.safeParse(request.params.processId);
    if (!processId.success) return invalid(response, "Business process ID must be a UUID");
    const models = await repository.list(request.principal!.tenantId, processId.data);
    if (!models) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Business process not found" } });
    response.json({ data: models });
  });

  router.post("/", requirePermission("business_process_models:create"), async (request, response) => {
    const processId = uuidSchema.safeParse(request.params.processId);
    if (!processId.success) return invalid(response, "Business process ID must be a UUID");
    const parsed = processModelInputSchema.safeParse(request.body);
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid process model payload");
    try {
      const model = await repository.create(request.principal!.tenantId, processId.data, request.principal!.subject, parsed.data);
      if (!model) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Business process not found" } });
      response.status(201).json({ data: model });
    } catch (error) {
      if (!handleModelError(error, response)) throw error;
    }
  });

  router.get("/:modelVersionId", requirePermission("business_process_models:read"), async (request, response) => {
    const processId = uuidSchema.safeParse(request.params.processId);
    const modelId = uuidSchema.safeParse(request.params.modelVersionId);
    if (!processId.success || !modelId.success) return invalid(response, "Business process and model version IDs must be UUIDs");
    const model = await repository.get(request.principal!.tenantId, processId.data, modelId.data);
    if (!model) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Process model version not found" } });
    response.json({ data: model });
  });

  router.put("/:modelVersionId", requirePermission("business_process_models:update"), async (request, response) => {
    const processId = uuidSchema.safeParse(request.params.processId);
    const modelId = uuidSchema.safeParse(request.params.modelVersionId);
    const parsed = processModelInputSchema.safeParse(request.body);
    if (!processId.success || !modelId.success) return invalid(response, "Business process and model version IDs must be UUIDs");
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid process model payload");
    try {
      const model = await repository.update(request.principal!.tenantId, processId.data, modelId.data, request.principal!.subject, parsed.data);
      if (!model) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Process model version not found" } });
      response.json({ data: model });
    } catch (error) {
      if (!handleModelError(error, response)) throw error;
    }
  });

  router.post("/:modelVersionId/confirm", requirePermission("business_process_models:confirm"), async (request, response) => {
    const processId = uuidSchema.safeParse(request.params.processId);
    const modelId = uuidSchema.safeParse(request.params.modelVersionId);
    if (!processId.success || !modelId.success) return invalid(response, "Business process and model version IDs must be UUIDs");
    try {
      const model = await repository.confirm(request.principal!.tenantId, processId.data, modelId.data, request.principal!.subject);
      if (!model) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Process model version not found" } });
      response.json({ data: model });
    } catch (error) {
      if (!handleModelError(error, response)) throw error;
    }
  });

  router.post("/:modelVersionId/publish", requirePermission("business_process_models:publish"), async (request, response) => {
    const processId = uuidSchema.safeParse(request.params.processId);
    const modelId = uuidSchema.safeParse(request.params.modelVersionId);
    if (!processId.success || !modelId.success) return invalid(response, "Business process and model version IDs must be UUIDs");
    try {
      const model = await repository.publish(request.principal!.tenantId, processId.data, modelId.data, request.principal!.subject);
      if (!model) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Process model version not found" } });
      response.json({ data: model });
    } catch (error) {
      if (!handleModelError(error, response)) throw error;
    }
  });

  router.post("/:modelVersionId/facts/:factId/review", requirePermission("business_process_models:review_facts"), async (request, response) => {
    const processId = uuidSchema.safeParse(request.params.processId);
    const modelId = uuidSchema.safeParse(request.params.modelVersionId);
    const factId = uuidSchema.safeParse(request.params.factId);
    const parsed = reviewInputSchema.safeParse(request.body);
    if (!processId.success || !modelId.success || !factId.success) return invalid(response, "Business process, model version and fact IDs must be UUIDs");
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid fact review payload");
    if (parsed.data.reviewState === "verified" && !request.principal!.permissions.includes("business_process_models:verify_facts")) {
      return response.status(403).json({ error: { code: "FORBIDDEN", message: "Fact verification requires a separate permission" } });
    }
    try {
      const fact = await repository.reviewFact(
        request.principal!.tenantId, processId.data, modelId.data, factId.data,
        request.principal!.subject, parsed.data.reviewState
      );
      if (!fact) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Process model fact not found" } });
      response.json({ data: fact });
    } catch (error) {
      if (!handleModelError(error, response)) throw error;
    }
  });

  return router;
}
