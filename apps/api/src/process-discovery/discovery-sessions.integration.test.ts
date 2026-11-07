import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { DiscoverySessionConversionError, postgresDiscoverySessionRepository } from "./discovery-sessions.js";

const tenantA = randomUUID();
const tenantB = randomUUID();
const actorId = "discovery-session-integration-actor";
const description = "We manually process internal service requests.";

const completeFacts = [
  { fieldPath: "purpose", value: "Resolve internal service requests" },
  { fieldPath: "trigger", value: "A team submits a request" },
  { fieldPath: "expectedOutcome", value: "The request is resolved or returned with a reason" },
  { fieldPath: "steps", value: [
    { key: "receive", kind: "start", name: "Receive request" },
    { key: "review", kind: "decision", name: "Check completeness", participant: { kind: "role", label: "Operations reviewer" } },
    { key: "close", kind: "end", name: "Close request" }
  ] },
  { fieldPath: "transitions", value: [
    { fromStepKey: "receive", toStepKey: "review", kind: "sequence" },
    { fromStepKey: "review", toStepKey: "close", kind: "conditional", label: "Complete" }
  ] }
];

async function createTenant(id: string, name: string): Promise<void> {
  await pool.query("INSERT INTO tenants (id,name) VALUES ($1,$2)", [id, name]);
}

describe("Process Discovery Sessions PostgreSQL persistence and lifecycle", () => {

  it("converts a confirmed snapshot atomically into one catalogue process and a draft model, idempotently", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    const answered = await postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
      message: "The purpose, trigger, outcome and activities are captured.",
      factUpdates: completeFacts,
      expectedRevision: session.revision
    });
    const confirmed = await postgresDiscoverySessionRepository.confirm(
      tenantA, session.id, actorId, answered!.revision
    );

    const conversion = await postgresDiscoverySessionRepository.convertToProcess(
      tenantA, session.id, actorId, { name: "Internal service request handling" }
    );
    expect(conversion).toMatchObject({
      sessionId: session.id,
      processName: "Internal service request handling",
      modelVersion: 1,
      modelStatus: "draft",
      alreadyConverted: false
    });

    const process = await pool.query(
      "SELECT name,description,sensitivity FROM business_processes WHERE tenant_id=$1 AND id=$2",
      [tenantA, conversion!.processId]
    );
    expect(process.rows[0]).toMatchObject({
      name: "Internal service request handling",
      description: "Resolve internal service requests",
      sensitivity: "unknown"
    });

    const model = await pool.query(
      "SELECT status,purpose,trigger_definition,expected_outcome FROM business_process_model_versions WHERE tenant_id=$1 AND process_id=$2 AND id=$3",
      [tenantA, conversion!.processId, conversion!.modelVersionId]
    );
    expect(model.rows[0]).toMatchObject({
      status: "draft",
      purpose: "Resolve internal service requests",
      trigger_definition: "A team submits a request",
      expected_outcome: "The request is resolved or returned with a reason"
    });
    const [steps, transitions, evidence, facts] = await Promise.all([
      pool.query("SELECT step_key,kind,name FROM business_process_model_steps WHERE tenant_id=$1 AND model_version_id=$2 ORDER BY step_key", [tenantA, conversion!.modelVersionId]),
      pool.query("SELECT count(*)::int AS count FROM business_process_model_transitions WHERE tenant_id=$1 AND model_version_id=$2", [tenantA, conversion!.modelVersionId]),
      pool.query("SELECT source_kind,source_label,source_reference FROM business_process_model_evidence WHERE tenant_id=$1 AND model_version_id=$2", [tenantA, conversion!.modelVersionId]),
      pool.query("SELECT field_path,provenance_kind,evidence_id FROM business_process_model_facts WHERE tenant_id=$1 AND model_version_id=$2", [tenantA, conversion!.modelVersionId])
    ]);
    expect(steps.rows).toHaveLength(3);
    expect(transitions.rows[0]?.count).toBe(2);
    expect(evidence.rows[0]).toMatchObject({
      source_kind: "user_input",
      source_label: "Confirmed discovery session",
      source_reference: "cias://process-discovery/sessions/" + session.id
    });
    expect(facts.rows.length).toBeGreaterThanOrEqual(4);
    expect(facts.rows.every((fact) => fact.provenance_kind === "user_statement" && fact.evidence_id === evidence.rows[0]?.id)).toBe(true);

    const repeated = await postgresDiscoverySessionRepository.convertToProcess(
      tenantA, session.id, actorId, { name: "A different name must not duplicate the conversion" }
    );
    expect(repeated).toMatchObject({
      processId: conversion!.processId,
      modelVersionId: conversion!.modelVersionId,
      alreadyConverted: true
    });
    const count = await pool.query(
      "SELECT count(*)::int AS count FROM process_discovery_conversions WHERE tenant_id=$1 AND session_id=$2",
      [tenantA, session.id]
    );
    expect(count.rows[0]?.count).toBe(1);
    expect(confirmed?.status).toBe("confirmed");
  });

  it("refuses conversion until the discovery snapshot has been confirmed and enforces tenant scope", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    await expect(
      postgresDiscoverySessionRepository.convertToProcess(tenantA, session.id, actorId, { name: "Unconfirmed process" })
    ).rejects.toBeInstanceOf(DiscoverySessionConversionError);
    await expect(
      postgresDiscoverySessionRepository.convertToProcess(tenantB, session.id, actorId, { name: "Cross-tenant process" })
    ).resolves.toBeNull();
  });


  beforeAll(async () => {
    await createTenant(tenantA, "Discovery tenant A");
    await createTenant(tenantB, "Discovery tenant B");
  }, 15_000);

  afterAll(async () => {
    await pool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM process_discovery_conversions WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM business_processes WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM process_discovery_sessions WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  }, 15_000);

  it("persists the initial description, assistant question and incomplete gate", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description,
      factUpdates: []
    });
    expect(session.status).toBe("active");
    expect(session.classification).toBe("unknown");
    expect(session.revision).toBe(1);
    expect(session.currentQuestionId).toBe("purpose");
    expect(session.completeness.requiredMissing).toEqual(["purpose", "trigger", "expectedOutcome", "steps"]);
    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]?.speaker).toBe("user");
    expect(session.turns[1]?.speaker).toBe("assistant");

    const resumed = await postgresDiscoverySessionRepository.get(tenantA, session.id);
    expect(resumed?.initialDescription).toBe(description);
    expect(resumed?.revision).toBe(1);
    expect(resumed?.turns).toHaveLength(2);
  });

  it("keeps tenant boundaries on session retrieval and listing", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    await expect(postgresDiscoverySessionRepository.get(tenantB, session.id)).resolves.toBeNull();
    await expect(postgresDiscoverySessionRepository.list(tenantB, { limit: 50, after: null }))
      .resolves.toMatchObject({ items: [], hasMore: false });
  });

  it("records fact revisions with provenance and reaches review only after the deterministic gate", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    const updated = await postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
      message: "Purpose, trigger, outcome and main steps are now specified.",
      factUpdates: completeFacts,
      expectedRevision: session.revision,
      answerToQuestionId: "purpose"
    });
    expect(updated?.status).toBe("ready_for_review");
    expect(updated?.completeness.canConfirm).toBe(true);
    expect(updated?.currentQuestionId).toBeNull();
    expect(updated?.factEvents).toHaveLength(5);
    expect(updated?.factEvents.every((fact) => fact.provenanceKind === "user_statement" && fact.reviewState === "unreviewed")).toBe(true);
    expect(updated?.currentDraft.steps).toHaveLength(3);
    expect(updated?.currentDraft.transitions).toHaveLength(2);
  });

  it("surfaces unresolved uncertainty and requires explicit acknowledgement at confirmation", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    const uncertainFacts = [
      ...completeFacts,
      {
        fieldPath: "uncertainties",
        value: [{
          fieldPath: "context.volume",
          description: "Peak monthly request volume is not yet known",
          whyItMatters: "Capacity and impact estimates may be unreliable without a volume baseline"
        }]
      }
    ];
    const updated = await postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
      message: "The main map is captured, but peak volume is still unknown.",
      factUpdates: uncertainFacts,
      expectedRevision: session.revision
    });
    expect(updated?.completeness.canConfirm).toBe(true);
    expect(updated?.completeness.openUncertainties).toHaveLength(1);
    await expect(
      postgresDiscoverySessionRepository.confirm(tenantA, session.id, actorId, updated!.revision)
    ).rejects.toThrow("Acknowledge it explicitly");
    const confirmed = await postgresDiscoverySessionRepository.confirm(
      tenantA, session.id, actorId, updated!.revision, true
    );
    expect(confirmed?.status).toBe("confirmed");
    const audit = await pool.query(
      "SELECT metadata FROM audit_events WHERE tenant_id=$1 AND resource_type='process_discovery_session' AND resource_id=$2 AND action='process_discovery_session.confirmed'",
      [tenantA, session.id]
    );
    expect(audit.rows[0]?.metadata.acknowledgedUncertainties).toEqual([{
      fieldPath: "context.volume",
      description: "Peak monthly request volume is not yet known",
      whyItMatters: "Capacity and impact estimates may be unreliable without a volume baseline"
    }]);
  });

  it("does not allow superseded fact history to be edited or restored", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description,
      factUpdates: [{ fieldPath: "purpose", value: "Original purpose" }]
    });
    const firstFact = session.factEvents.find((fact) => fact.fieldPath === "purpose")!;
    expect(firstFact.isCurrent).toBe(true);

    const updated = await postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
      message: "Correction: this process resolves internal requests.",
      factUpdates: [{ fieldPath: "purpose", value: "Resolve internal requests" }],
      expectedRevision: session.revision
    });
    const superseded = updated!.factEvents.find((fact) => fact.id === firstFact.id)!;
    expect(superseded.isCurrent).toBe(false);

    await expect(pool.query(
      "UPDATE process_discovery_session_fact_events SET value=$3::jsonb WHERE tenant_id=$1 AND id=$2",
      [tenantA, firstFact.id, JSON.stringify("tampered")]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(pool.query(
      "UPDATE process_discovery_session_fact_events SET is_current=true WHERE tenant_id=$1 AND id=$2",
      [tenantA, firstFact.id]
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("blocks confirmation while required information is missing", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    await expect(
      postgresDiscoverySessionRepository.confirm(tenantA, session.id, actorId, session.revision)
    ).rejects.toThrow("minimum information gate");
  });

  it("detects stale revisions and confirms an immutable user-reviewed snapshot", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    const updated = await postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
      message: "The minimum map is now described.",
      factUpdates: completeFacts,
      expectedRevision: session.revision
    });
    await expect(
      postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
        message: "A stale answer", factUpdates: [{ fieldPath: "scope", value: "Stale scope" }],
        expectedRevision: session.revision
      })
    ).rejects.toThrow("changed after it was opened");

    const confirmed = await postgresDiscoverySessionRepository.confirm(tenantA, session.id, actorId, updated!.revision);
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.factEvents.every((fact) => fact.reviewState === "user_confirmed")).toBe(true);
    await expect(
      postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
        message: "Late edit", factUpdates: [{ fieldPath: "scope", value: "No" }],
        expectedRevision: confirmed!.revision
      })
    ).rejects.toThrow("confirmed");
    await expect(
      pool.query("UPDATE process_discovery_sessions SET revision=revision+1 WHERE tenant_id=$1 AND id=$2", [tenantA, session.id])
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("rejects invalid step graphs before facts are persisted", async () => {
    const session = await postgresDiscoverySessionRepository.create(tenantA, actorId, {
      initialDescription: description, factUpdates: []
    });
    await expect(
      postgresDiscoverySessionRepository.turn(tenantA, session.id, actorId, {
        message: "Invalid graph",
        factUpdates: [
          { fieldPath: "steps", value: [{ key: "only", kind: "activity", name: "Do work" }] },
          { fieldPath: "transitions", value: [{ fromStepKey: "only", toStepKey: "missing", kind: "sequence" }] }
        ],
        expectedRevision: session.revision
      })
    ).rejects.toThrow("process graph is invalid");
    const unchanged = await postgresDiscoverySessionRepository.get(tenantA, session.id);
    expect(unchanged?.revision).toBe(session.revision);
    expect(unchanged?.factEvents).toHaveLength(0);
  });
});
