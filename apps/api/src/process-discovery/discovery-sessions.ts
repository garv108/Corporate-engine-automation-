import { Router, type Response, type Router as ExpressRouter } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requirePermission } from "../auth/auth.js";
import { encodePaginationCursor, parsePaginationQuery, type Page, type PaginationOptions } from "../pagination/cursor-pagination.js";
import { processModelInputSchema, type ProcessModelInput } from "../process-models/process-models.js";

const questions = [
  { id: "purpose", fieldPath: "purpose", prompt: "What is the main purpose of this process? What need does it fulfil?", rationale: "The purpose defines why this process exists." },
  { id: "trigger", fieldPath: "trigger", prompt: "What event, request, schedule or condition starts this process?", rationale: "The trigger establishes where a process instance begins." },
  { id: "expectedOutcome", fieldPath: "expectedOutcome", prompt: "What should be true or delivered when this process is finished?", rationale: "The expected outcome gives the process a clear end condition." },
  { id: "steps", fieldPath: "steps", prompt: "What are the main activities or decisions, in the order they usually happen? Add each as a separate step.", rationale: "At least one activity is needed before CIAS can create a useful process map." }
] as const;



const questionMap = new Map<string, any>(questions.map((q) => [q.id, { ...q, required: true }] as const));
const stringValue = z.string().trim().min(1).max(5000);
const stringList = z.array(z.string().trim().min(1).max(1000)).max(100);
const uncertaintyList = z.array(z.object({
  fieldPath: z.string().trim().min(1).max(256),
  description: z.string().trim().min(1).max(1000),
  whyItMatters: z.string().trim().max(1000).optional()
}).strict()).max(100);

export type DiscoveryDraft = {
  purpose: string | null;
  scope: string | null;
  trigger: string | null;
  expectedOutcome: string | null;
  steps: ProcessModelInput["steps"];
  transitions: ProcessModelInput["transitions"];
  evidence: ProcessModelInput["evidence"];
  uncertainties: Array<{ fieldPath: string; description: string; whyItMatters?: string }>;
  context: {
    systems: string[]; inputs: string[]; outputs: string[]; decisions: string[]; exceptions: string[];
    humanJudgement: string | null; volume: string | null; timing: string | null;
    baseline: string | null; dataHandling: string | null; constraints: string[];
  };
};

export type DiscoveryCompleteness = {
  state: "incomplete" | "ready_for_review";
  canConfirm: boolean;
  requiredMissing: string[];
  recommendedMissing: string[];
  blockingIssues: string[];
  openUncertainties: Array<{ fieldPath: string; description: string; whyItMatters?: string }>;
};

export type DiscoverySession = {
  id: string; tenantId: string; status: "active" | "ready_for_review" | "confirmed" | "abandoned";
  initialDescription: string; classification: "unknown" | "public" | "internal" | "confidential" | "sensitive_workforce" | "restricted"; currentDraft: DiscoveryDraft; completeness: DiscoveryCompleteness;
  currentQuestionId: string | null; nextQuestion: any; revision: number; schemaVersion: number;
  confirmedBy: string | null; confirmedAt: string | null; createdBy: string;
  createdAt: string; updatedAt: string; turns: any[]; factEvents: any[];
};

export type DiscoveryFactUpdate = { fieldPath: string; value: unknown };
export type DiscoverySessionRepository = {
  create(tenantId: string, actorId: string, input: { initialDescription: string; factUpdates: DiscoveryFactUpdate[] }): Promise<DiscoverySession>;
  get(tenantId: string, sessionId: string): Promise<DiscoverySession | null>;
  list(tenantId: string, pagination: PaginationOptions): Promise<Page<any>>;
  turn(tenantId: string, sessionId: string, actorId: string, input: {
    message: string; factUpdates: DiscoveryFactUpdate[]; expectedRevision: number; answerToQuestionId?: string | undefined
  }): Promise<DiscoverySession | null>;
  confirm(tenantId: string, sessionId: string, actorId: string, expectedRevision: number, acknowledgeUnresolved?: boolean): Promise<DiscoverySession | null>;
};

export class DiscoverySessionStateError extends Error {
  constructor(state: string, action: string) { super("Cannot " + action + " a discovery session while it is " + state); }
}
export class DiscoverySessionRevisionError extends Error {
  constructor(readonly currentRevision: number) { super("This discovery session changed after it was opened. Reload it before submitting another answer."); }
}
export class DiscoverySessionCompletenessError extends Error {
  constructor(readonly completeness: DiscoveryCompleteness) { super("The minimum information gate is not satisfied. Resolve required missing information before confirmation."); }
}
export class DiscoverySessionUncertaintyError extends Error {
  constructor(readonly count: number) { super("The discovery snapshot contains unresolved uncertainty. Acknowledge it explicitly or resolve it before confirmation."); }
}
export class DiscoverySessionInputError extends Error {}

function emptyDraft(): DiscoveryDraft {
  return {
    purpose: null, scope: null, trigger: null, expectedOutcome: null,
    steps: [], transitions: [], evidence: [], uncertainties: [],
    context: {
      systems: [], inputs: [], outputs: [], decisions: [], exceptions: [],
      humanJudgement: null, volume: null, timing: null, baseline: null, dataHandling: null, constraints: []
    }
  };
}
const hasText = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const hasItems = (v: unknown) => Array.isArray(v) && v.length > 0;

function graphIssues(draft: DiscoveryDraft): string[] {
  if (!draft.steps.length) return [];
  const result = processModelInputSchema.safeParse({
    purpose: draft.purpose ?? undefined, scope: draft.scope ?? undefined,
    trigger: draft.trigger ?? undefined, expectedOutcome: draft.expectedOutcome ?? undefined,
    steps: draft.steps, transitions: draft.transitions, evidence: draft.evidence, facts: []
  });
  return result.success ? [] : result.error.issues.map((i) => (i.path.length ? i.path.join(".") + ": " : "") + i.message);
}

export function evaluateDiscoveryCompleteness(draft: DiscoveryDraft): DiscoveryCompleteness {
  const requiredMissing: string[] = [];
  if (!hasText(draft.purpose)) requiredMissing.push("purpose");
  if (!hasText(draft.trigger)) requiredMissing.push("trigger");
  if (!hasText(draft.expectedOutcome)) requiredMissing.push("expectedOutcome");
  if (!hasItems(draft.steps)) requiredMissing.push("steps");

  const recommendedMissing: string[] = [];
  if (!hasText(draft.scope)) recommendedMissing.push("scope");
  for (const key of ["systems", "inputs", "outputs", "decisions", "exceptions", "constraints"] as const) {
    if (!hasItems(draft.context[key])) recommendedMissing.push("context." + key);
  }
  for (const key of ["humanJudgement", "volume", "timing", "baseline", "dataHandling"] as const) {
    if (!hasText(draft.context[key])) recommendedMissing.push("context." + key);
  }
  const blockingIssues = graphIssues(draft);
  const openUncertainties = draft.uncertainties;
  const canConfirm = requiredMissing.length === 0 && blockingIssues.length === 0;
  return { state: canConfirm ? "ready_for_review" : "incomplete", canConfirm, requiredMissing, recommendedMissing, blockingIssues, openUncertainties };
}

function nextQuestion(completeness: DiscoveryCompleteness): any {
  if (completeness.canConfirm) return null;
  return questions.find((q) => completeness.requiredMissing.includes(q.fieldPath)) ?? null;
}
function assistantReply(completeness: DiscoveryCompleteness): string {
  const q = nextQuestion(completeness);
  if (q) return q.prompt + " " + q.rationale;
  const uncertaintySummary = completeness.openUncertainties.length
    ? " Unresolved uncertainties: " + completeness.openUncertainties.map((item) => item.description).join("; ") +
      ". You must explicitly acknowledge these before confirming, or resolve them first."
    : " No unresolved uncertainty items are recorded.";
  return "The minimum information gate is satisfied. Review the process map before confirming it. " +
    completeness.recommendedMissing.length + " recommended detail area(s) remain unrecorded; these are not blockers." +
    uncertaintySummary +
    " Confirmation records your review of this discovery snapshot. It does not publish an official process model or authorize automation.";
}

function parseValue(path: string, value: unknown): unknown {
  let schema: z.ZodTypeAny;
  switch (path) {
    case "purpose": case "scope": case "trigger": case "expectedOutcome":
    case "context.humanJudgement": case "context.volume": case "context.timing":
    case "context.baseline": case "context.dataHandling":
      schema = stringValue; break;
    case "context.systems": case "context.inputs": case "context.outputs":
    case "context.decisions": case "context.exceptions": case "context.constraints":
      schema = stringList; break;
    case "steps": schema = z.array(z.unknown()).max(200); break;
    case "transitions": schema = z.array(z.unknown()).max(400); break;
    case "evidence": schema = z.array(z.unknown()).max(200); break;
    case "uncertainties": schema = uncertaintyList; break;
    default: throw new DiscoverySessionInputError("Unsupported discovery fact path: " + path);
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new DiscoverySessionInputError("Invalid value for " + path + ": " + (result.error.issues[0]?.message ?? "invalid value"));
  return result.data;
}

function validateFactUpdates(updates: DiscoveryFactUpdate[]): void {
  if (updates.length > 20) throw new DiscoverySessionInputError("A single turn may update at most 20 fact paths.");
  const seen = new Set<string>();
  for (const update of updates) {
    if (seen.has(update.fieldPath)) {
      throw new DiscoverySessionInputError("A field path may only be updated once per turn: " + update.fieldPath);
    }
    seen.add(update.fieldPath);
    parseValue(update.fieldPath, update.value);
  }
}

function applyUpdates(current: DiscoveryDraft, updates: DiscoveryFactUpdate[]): DiscoveryDraft {
  if (!updates.length) return current;
  validateFactUpdates(updates);
  const draft = JSON.parse(JSON.stringify(current)) as DiscoveryDraft;
  for (const update of updates) {
    const value = parseValue(update.fieldPath, update.value);
    switch (update.fieldPath) {
      case "purpose": draft.purpose = value as string; break;
      case "scope": draft.scope = value as string; break;
      case "trigger": draft.trigger = value as string; break;
      case "expectedOutcome": draft.expectedOutcome = value as string; break;
      case "steps": draft.steps = value as ProcessModelInput["steps"]; break;
      case "transitions": draft.transitions = value as ProcessModelInput["transitions"]; break;
      case "evidence": draft.evidence = value as ProcessModelInput["evidence"]; break;
      case "uncertainties": draft.uncertainties = value as DiscoveryDraft["uncertainties"]; break;
      default: {
        const key = update.fieldPath.slice("context.".length);
        (draft.context as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }
  if (draft.steps.length) {
    const result = processModelInputSchema.safeParse({
      purpose: draft.purpose ?? undefined, scope: draft.scope ?? undefined,
      trigger: draft.trigger ?? undefined, expectedOutcome: draft.expectedOutcome ?? undefined,
      steps: draft.steps, transitions: draft.transitions, evidence: draft.evidence, facts: []
    });
    if (!result.success) throw new DiscoverySessionInputError("The updated process graph is invalid: " + (result.error.issues[0]?.message ?? "invalid graph"));
    draft.steps = result.data.steps;
    draft.transitions = result.data.transitions;
    draft.evidence = result.data.evidence;
  } else if (draft.transitions.length || draft.evidence.length) {
    throw new DiscoverySessionInputError("Add at least one valid process step before adding transitions or evidence.");
  }
  return draft;
}

function toSession(row: any): any {
  return {
    id: row.id, tenantId: row.tenantId, status: row.status, initialDescription: row.initialDescription, classification: row.classification,
    currentDraft: row.currentDraft, completeness: row.completeness, currentQuestionId: row.currentQuestionId,
    nextQuestion: row.currentQuestionId ? questionMap.get(row.currentQuestionId) ?? null : null,
    revision: row.revision, schemaVersion: row.schemaVersion, confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt, createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt
  };
}

const columns = [
  'id', 'tenant_id AS "tenantId"', 'status', 'initial_description AS "initialDescription"', 'classification',
  'current_draft AS "currentDraft"', 'completeness', 'current_question_id AS "currentQuestionId"',
  'revision', 'schema_version AS "schemaVersion"', 'confirmed_by AS "confirmedBy"',
  'confirmed_at AS "confirmedAt"', 'created_by AS "createdBy"', 'created_at AS "createdAt"',
  'updated_at AS "updatedAt"'
].join(", ");

async function addTurn(client: PoolClient, tenantId: string, sessionId: string, sequence: number,
  speaker: "user" | "assistant", content: string, questionId: string | null, actorId: string | null): Promise<string> {
  const result = await client.query(
    "INSERT INTO process_discovery_session_turns (tenant_id,session_id,sequence_number,speaker,content,question_id,actor_id) " +
    "VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [tenantId, sessionId, sequence, speaker, content, questionId, actorId]
  );
  return result.rows[0]!.id;
}

async function addFactEvents(client: PoolClient, tenantId: string, sessionId: string, turnId: string,
  actorId: string, updates: DiscoveryFactUpdate[]): Promise<void> {
  for (const update of updates) {
    const value = parseValue(update.fieldPath, update.value);
    await client.query(
      "UPDATE process_discovery_session_fact_events SET is_current=false " +
      "WHERE tenant_id=$1 AND session_id=$2 AND field_path=$3 AND is_current=true",
      [tenantId, sessionId, update.fieldPath]
    );
    await client.query(
      "INSERT INTO process_discovery_session_fact_events " +
      "(tenant_id,session_id,source_turn_id,field_path,value,provenance_kind,recorded_by) " +
      "VALUES ($1,$2,$3,$4,$5::jsonb,'user_statement',$6)",
      [tenantId, sessionId, turnId, update.fieldPath, JSON.stringify(value), actorId]
    );
  }
}

async function audit(client: PoolClient, tenantId: string, actorId: string, action: string,
  sessionId: string, metadata: Record<string, unknown>): Promise<void> {
  await client.query(
    "INSERT INTO audit_events (tenant_id,actor_type,actor_id,action,resource_type,resource_id,decision,metadata) " +
    "VALUES ($1,'user',$2,$3,'process_discovery_session',$4,'allowed',$5::jsonb)",
    [tenantId, actorId, action, sessionId, JSON.stringify(metadata)]
  );
}

async function load(client: PoolClient, tenantId: string, sessionId: string): Promise<DiscoverySession | null> {
  const result = await client.query(
    "SELECT " + columns + " FROM process_discovery_sessions WHERE tenant_id=$1 AND id=$2",
    [tenantId, sessionId]
  );
  if (!result.rowCount) return null;
  const [turns, facts] = await Promise.all([
    client.query(
      'SELECT id,sequence_number AS "sequenceNumber",speaker,content,question_id AS "questionId",actor_id AS "actorId",created_at AS "createdAt" ' +
      "FROM process_discovery_session_turns WHERE tenant_id=$1 AND session_id=$2 ORDER BY sequence_number",
      [tenantId, sessionId]
    ),
    client.query(
      'SELECT id,source_turn_id AS "sourceTurnId",field_path AS "fieldPath",value,provenance_kind AS "provenanceKind",review_state AS "reviewState",is_current AS "isCurrent",recorded_by AS "recordedBy",recorded_at AS "recordedAt",reviewed_by AS "reviewedBy",reviewed_at AS "reviewedAt" ' +
      "FROM process_discovery_session_fact_events WHERE tenant_id=$1 AND session_id=$2 ORDER BY recorded_at,id",
      [tenantId, sessionId]
    )
  ]);
  return { ...toSession(result.rows[0]), turns: turns.rows, factEvents: facts.rows };
}

export class PostgresDiscoverySessionRepository implements DiscoverySessionRepository {
  async create(tenantId: string, actorId: string, input: { initialDescription: string; factUpdates: DiscoveryFactUpdate[] }): Promise<DiscoverySession> {
    const draft = applyUpdates(emptyDraft(), input.factUpdates);
    const completeness = evaluateDiscoveryCompleteness(draft);
    const status = completeness.canConfirm ? "ready_for_review" : "active";
    const questionId = nextQuestion(completeness)?.id ?? null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        "INSERT INTO process_discovery_sessions (tenant_id,status,initial_description,classification,current_draft,completeness,current_question_id,revision,schema_version,created_by) " +
        "VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,0,1,$8) RETURNING id",
        [tenantId, "active", input.initialDescription, "unknown",
          JSON.stringify(emptyDraft()), JSON.stringify(evaluateDiscoveryCompleteness(emptyDraft())), "purpose", actorId]
      );
      const sessionId = inserted.rows[0]!.id;
      const userTurn = await addTurn(client, tenantId, sessionId, 1, "user", input.initialDescription, null, actorId);
      if (input.factUpdates.length) await addFactEvents(client, tenantId, sessionId, userTurn, actorId, input.factUpdates);
      await addTurn(client, tenantId, sessionId, 2, "assistant", assistantReply(completeness), questionId, null);
      await client.query(
        "UPDATE process_discovery_sessions SET status=$3,current_draft=$4::jsonb,completeness=$5::jsonb,current_question_id=$6,revision=1,updated_at=now() " +
        "WHERE tenant_id=$1 AND id=$2",
        [tenantId, sessionId, status, JSON.stringify(draft), JSON.stringify(completeness), questionId]
      );
      await audit(client, tenantId, actorId, "process_discovery_session.created", sessionId, {
        status, factPaths: input.factUpdates.map((item) => item.fieldPath)
      });
      const session = await load(client, tenantId, sessionId);
      await client.query("COMMIT");
      return session!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: string, sessionId: string): Promise<DiscoverySession | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const session = await load(client, tenantId, sessionId);
      await client.query("COMMIT");
      return session;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(tenantId: string, pagination: PaginationOptions): Promise<Page<any>> {
    const result = await pool.query(
      'SELECT id,status,initial_description AS "initialDescription",completeness,revision,created_at AS "createdAt",updated_at AS "updatedAt" ' +
      "FROM process_discovery_sessions WHERE tenant_id=$1 " +
      "AND ($2::timestamptz IS NULL OR (created_at,id) < ($2::timestamptz,$3::uuid)) " +
      "ORDER BY created_at DESC,id DESC LIMIT $4",
      [tenantId, pagination.after?.name ?? null, pagination.after?.id ?? null, pagination.limit + 1]
    );
    return { items: result.rows.slice(0, pagination.limit), hasMore: result.rows.length > pagination.limit };
  }

  async turn(tenantId: string, sessionId: string, actorId: string, input: {
    message: string; factUpdates: DiscoveryFactUpdate[]; expectedRevision: number; answerToQuestionId?: string | undefined
  }): Promise<DiscoverySession | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        "SELECT " + columns + " FROM process_discovery_sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [tenantId, sessionId]
      );
      if (!selected.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const current = toSession(selected.rows[0]) as DiscoverySession;
      if (current.revision !== input.expectedRevision) throw new DiscoverySessionRevisionError(current.revision);
      if (!["active", "ready_for_review"].includes(current.status)) throw new DiscoverySessionStateError(current.status, "add a turn to");
      if (input.answerToQuestionId && input.answerToQuestionId !== current.currentQuestionId) {
        throw new DiscoverySessionRevisionError(current.revision);
      }
      const draft = applyUpdates(current.currentDraft, input.factUpdates);
      const completeness = evaluateDiscoveryCompleteness(draft);
      const status = completeness.canConfirm ? "ready_for_review" : "active";
      const questionId = nextQuestion(completeness)?.id ?? null;
      const seqResult = await client.query(
        "SELECT COALESCE(MAX(sequence_number),0)+1 AS next FROM process_discovery_session_turns WHERE tenant_id=$1 AND session_id=$2",
        [tenantId, sessionId]
      );
      const seq = Number(seqResult.rows[0]!.next);
      const userTurn = await addTurn(client, tenantId, sessionId, seq, "user", input.message, input.answerToQuestionId ?? current.currentQuestionId, actorId);
      await addFactEvents(client, tenantId, sessionId, userTurn, actorId, input.factUpdates);
      await addTurn(client, tenantId, sessionId, seq + 1, "assistant", assistantReply(completeness), questionId, null);
      await client.query(
        "UPDATE process_discovery_sessions SET status=$3,current_draft=$4::jsonb,completeness=$5::jsonb,current_question_id=$6,revision=revision+1,updated_at=now() " +
        "WHERE tenant_id=$1 AND id=$2",
        [tenantId, sessionId, status, JSON.stringify(draft), JSON.stringify(completeness), questionId]
      );
      await audit(client, tenantId, actorId, "process_discovery_session.turn_added", sessionId, {
        previousRevision: current.revision, nextRevision: current.revision + 1,
        factPaths: input.factUpdates.map((item) => item.fieldPath), completeness: completeness.state
      });
      const session = await load(client, tenantId, sessionId);
      await client.query("COMMIT");
      return session;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async confirm(tenantId: string, sessionId: string, actorId: string, expectedRevision: number, acknowledgeUnresolved = false): Promise<DiscoverySession | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        "SELECT " + columns + " FROM process_discovery_sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [tenantId, sessionId]
      );
      if (!selected.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const current = toSession(selected.rows[0]) as DiscoverySession;
      if (current.revision !== expectedRevision) throw new DiscoverySessionRevisionError(current.revision);
      if (!["active", "ready_for_review"].includes(current.status)) throw new DiscoverySessionStateError(current.status, "confirm");
      if (!current.completeness.canConfirm) throw new DiscoverySessionCompletenessError(current.completeness);
      if (current.completeness.openUncertainties.length && !acknowledgeUnresolved) {
        throw new DiscoverySessionUncertaintyError(current.completeness.openUncertainties.length);
      }
      const seqResult = await client.query(
        "SELECT COALESCE(MAX(sequence_number),0)+1 AS next FROM process_discovery_session_turns WHERE tenant_id=$1 AND session_id=$2",
        [tenantId, sessionId]
      );
      const seq = Number(seqResult.rows[0].next);
      await addTurn(client, tenantId, sessionId, seq, "user", "I reviewed and confirm this discovery snapshot.", null, actorId);
      await addTurn(client, tenantId, sessionId, seq + 1, "assistant",
        "Discovery snapshot confirmed. This does not publish an official process model or authorize automation.", null, null);
      await client.query(
        "UPDATE process_discovery_session_fact_events SET review_state='user_confirmed',reviewed_by=$3,reviewed_at=now() " +
        "WHERE tenant_id=$1 AND session_id=$2 AND is_current=true AND provenance_kind='user_statement' AND review_state='unreviewed'",
        [tenantId, sessionId, actorId]
      );
      await client.query(
        "UPDATE process_discovery_sessions SET status='confirmed',confirmed_by=$3,confirmed_at=now(),current_question_id=NULL,revision=revision+1,updated_at=now() " +
        "WHERE tenant_id=$1 AND id=$2",
        [tenantId, sessionId, actorId]
      );
      await audit(client, tenantId, actorId, "process_discovery_session.confirmed", sessionId, {
        previousRevision: current.revision, nextRevision: current.revision + 1, contentScope: "discovery_snapshot_only",
        acknowledgedUncertainties: current.completeness.openUncertainties.length
      });
      const session = await load(client, tenantId, sessionId);
      await client.query("COMMIT");
      return session;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const postgresDiscoverySessionRepository = new PostgresDiscoverySessionRepository();

const factUpdateSchema = z.object({
  fieldPath: z.string().trim().min(1).max(256),
  value: z.unknown()
}).strict().superRefine((item, context) => {
  if (!Object.prototype.hasOwnProperty.call(item, "value")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Fact value is required" });
  }
}).transform((item): DiscoveryFactUpdate => ({
  fieldPath: item.fieldPath,
  value: item.value
}));

const createSchema = z.object({
  initialDescription: z.string().trim().min(10).max(10000),
  factUpdates: z.array(factUpdateSchema).max(20).default([])
}).strict();

const turnSchema = z.object({
  message: z.string().trim().min(1).max(10000),
  factUpdates: z.array(factUpdateSchema).min(1).max(20),
  expectedRevision: z.number().int().nonnegative(),
  answerToQuestionId: z.string().trim().min(1).max(64).optional()
}).strict();
const confirmSchema = z.object({ expectedRevision: z.number().int().nonnegative(), acknowledgeUnresolved: z.boolean().default(false) }).strict();
const uuidSchema = z.string().uuid();

function invalid(response: Response, message: string): void {
  response.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function handleError(error: unknown, response: Response): boolean {
  if (error instanceof DiscoverySessionRevisionError) {
    response.status(409).json({ error: { code: "REVISION_CONFLICT", message: error.message, currentRevision: error.currentRevision } });
    return true;
  }
  if (error instanceof DiscoverySessionUncertaintyError) {
    response.status(409).json({ error: { code: "UNCERTAINTIES_NOT_ACKNOWLEDGED", message: error.message, count: error.count } });
    return true;
  }
  if (error instanceof DiscoverySessionCompletenessError) {
    response.status(409).json({ error: { code: "COMPLETENESS_GATE_BLOCKED", message: error.message, completeness: error.completeness } });
    return true;
  }
  if (error instanceof DiscoverySessionStateError) {
    response.status(409).json({ error: { code: "INVALID_SESSION_STATE", message: error.message } });
    return true;
  }
  if (error instanceof DiscoverySessionInputError) {
    response.status(400).json({ error: { code: "INVALID_DISCOVERY_INPUT", message: error.message } });
    return true;
  }
  if ((error as { code?: string })?.code === "55000") {
    response.status(409).json({ error: { code: "INVALID_SESSION_STATE", message: "The discovery session no longer accepts changes" } });
    return true;
  }
  return false;
}

export function createDiscoverySessionsRouter(repository: DiscoverySessionRepository = postgresDiscoverySessionRepository): ExpressRouter {
  const router = Router();
  router.use((request, response, next) => {
    if (!request.principal) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } });
      return;
    }
    next();
  });

  router.get("/", requirePermission("process_discovery_sessions:read"), async (request, response) => {
    const parsed = parsePaginationQuery(request.query);
    if (!parsed.success) return invalid(response, parsed.message);
    const page = await repository.list(request.principal!.tenantId, parsed.data);
    const last = page.items.at(-1);
    response.json({
      data: page.items,
      pagination: {
        limit: parsed.data.limit,
        nextCursor: page.hasMore && last
          ? encodePaginationCursor({ name: new Date(last.createdAt).toISOString(), id: last.id })
          : null
      }
    });
  });

  router.post("/", requirePermission("process_discovery_sessions:create"), async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid discovery session payload");
    try {
      validateFactUpdates(parsed.data.factUpdates);
      const session = await repository.create(request.principal!.tenantId, request.principal!.subject, parsed.data);
      response.status(201).json({ data: session });
    } catch (error) {
      if (!handleError(error, response)) throw error;
    }
  });

  router.get("/:sessionId", requirePermission("process_discovery_sessions:read"), async (request, response) => {
    const id = uuidSchema.safeParse(request.params.sessionId);
    if (!id.success) return invalid(response, "Discovery session ID must be a UUID");
    const session = await repository.get(request.principal!.tenantId, id.data);
    if (!session) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Discovery session not found" } });
    response.json({ data: session });
  });

  router.post("/:sessionId/turns", requirePermission("process_discovery_sessions:update"), async (request, response) => {
    const id = uuidSchema.safeParse(request.params.sessionId);
    const parsed = turnSchema.safeParse(request.body);
    if (!id.success) return invalid(response, "Discovery session ID must be a UUID");
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid discovery turn payload");
    try {
      validateFactUpdates(parsed.data.factUpdates);
      const session = await repository.turn(request.principal!.tenantId, id.data, request.principal!.subject, parsed.data);
      if (!session) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Discovery session not found" } });
      response.json({ data: session });
    } catch (error) {
      if (!handleError(error, response)) throw error;
    }
  });

  router.post("/:sessionId/confirm", requirePermission("process_discovery_sessions:confirm"), async (request, response) => {
    const id = uuidSchema.safeParse(request.params.sessionId);
    const parsed = confirmSchema.safeParse(request.body);
    if (!id.success) return invalid(response, "Discovery session ID must be a UUID");
    if (!parsed.success) return invalid(response, parsed.error.issues[0]?.message ?? "Invalid confirmation payload");
    try {
      const session = await repository.confirm(request.principal!.tenantId, id.data, request.principal!.subject, parsed.data.expectedRevision, parsed.data.acknowledgeUnresolved);
      if (!session) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Discovery session not found" } });
      response.json({ data: session });
    } catch (error) {
      if (!handleError(error, response)) throw error;
    }
  });

  return router;
}
