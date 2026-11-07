import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { postgresProcessModelRepository, type ProcessModelInput } from "./process-models.js";

const tenantA = randomUUID();
const tenantB = randomUUID();
const processA = randomUUID();
const processB = randomUUID();
const actorId = "process-model-integration-actor";

const input: ProcessModelInput = {
  purpose: "Resolve an internal service request",
  scope: "Requests submitted by internal teams",
  trigger: "A request is submitted",
  expectedOutcome: "The request is resolved or returned with a reason",
  steps: [
    {
      key: "start",
      kind: "start",
      name: "Receive request",
      participant: { kind: "system", label: "Request portal" },
      systems: ["Request portal"],
      inputs: [{ key: "request", label: "Submitted request", dataType: "record" }],
      outputs: [{ key: "case", label: "Request case", dataType: "record" }],
      rules: [],
      exceptions: []
    },
    {
      key: "review",
      kind: "decision",
      name: "Check request completeness",
      participant: { kind: "role", label: "Operations reviewer" },
      systems: ["Operations queue"],
      inputs: [],
      outputs: [],
      rules: [{ key: "complete", label: "Required information is present" }],
      exceptions: [{ key: "missing", label: "Information is missing" }],
      humanJudgement: "Reviewer may request context when the policy is ambiguous",
      layout: { x: 200, y: 80 }
    },
    {
      key: "finish",
      kind: "end",
      name: "Close request",
      participant: { kind: "unknown" },
      systems: [],
      inputs: [],
      outputs: [],
      rules: [],
      exceptions: []
    }
  ],
  transitions: [
    { fromStepKey: "start", toStepKey: "review", kind: "sequence" },
    { fromStepKey: "review", toStepKey: "finish", kind: "conditional", label: "Complete" }
  ],
  evidence: [
    {
      key: "guide",
      sourceKind: "external_document",
      sourceLabel: "Request handling guide",
      sourceReference: "https://example.test/request-guide",
      contentHash: "b".repeat(64),
      classification: "internal"
    }
  ],
  facts: [
    {
      fieldPath: "purpose",
      value: "Resolve an internal service request",
      provenanceKind: "user_statement",
      evidenceKey: "guide"
    },
    {
      fieldPath: "steps.review.humanJudgement",
      value: "Human review remains necessary for ambiguous cases",
      provenanceKind: "ai_hypothesis",
      stepKey: "review",
      evidenceKey: "guide"
    }
  ]
};

async function insertProcess(id: string, tenantId: string, name: string): Promise<void> {
  await pool.query(
    "INSERT INTO business_processes (id, tenant_id, name, systems, inputs, outputs, sensitivity) " +
    "VALUES ($1,$2,$3,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'unknown')",
    [id, tenantId, name]
  );
}

describe("Process Models PostgreSQL tenant integrity and lifecycle", () => {
  beforeAll(async () => {
    await pool.query(
      "INSERT INTO tenants (id, name) VALUES ($1, 'Process model tenant A'), ($2, 'Process model tenant B')",
      [tenantA, tenantB]
    );
    await insertProcess(processA, tenantA, "Service request");
    await insertProcess(processB, tenantB, "Finance request");
  }, 15_000);

  afterAll(async () => {
    await pool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM business_processes WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  }, 15_000);

  it("persists an industry-neutral process graph, evidence and fact provenance", async () => {
    const model = await postgresProcessModelRepository.create(tenantA, processA, actorId, input);
    expect(model).not.toBeNull();
    expect(model?.version).toBe(1);
    expect(model?.status).toBe("draft");
    expect(model?.steps).toHaveLength(3);
    expect(model?.transitions).toHaveLength(2);
    expect(model?.evidence).toHaveLength(1);
    expect(model?.facts).toHaveLength(2);
    expect(model?.facts[0]?.reviewState).toBe("unreviewed");
    expect(model?.facts.find((fact) => fact.provenanceKind === "ai_hypothesis")).toBeDefined();
    expect(model?.transitions[0]?.fromStepId).not.toBe(model?.transitions[0]?.toStepId);
    const fetched = await postgresProcessModelRepository.get(tenantA, processA, model!.id);
    expect(fetched?.contentHash).toBe(model?.contentHash);
    expect(fetched?.steps.find((step) => step.key === "review")?.participant?.kind).toBe("role");
  });

  it("rejects cross-tenant process/model reads and cross-version step references", async () => {
    const first = await postgresProcessModelRepository.create(tenantA, processA, actorId, input);
    expect(first).not.toBeNull();
    await expect(postgresProcessModelRepository.get(tenantA, processB, first!.id)).resolves.toBeNull();
    await expect(postgresProcessModelRepository.list(tenantA, processB)).resolves.toBeNull();

    const second = await postgresProcessModelRepository.create(tenantA, processA, actorId, input);
    expect(second).not.toBeNull();
    await expect(pool.query(
      "INSERT INTO business_process_model_transitions (tenant_id, model_version_id, from_step_id, to_step_id, kind) " +
      "VALUES ($1,$2,$3,$4,'sequence')",
      [tenantA, second!.id, first!.steps[0]!.id, second!.steps[1]!.id]
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("allows draft replacement, then confirms and publishes an immutable snapshot", async () => {
    const draft = await postgresProcessModelRepository.create(tenantA, processA, actorId, input);
    expect(draft).not.toBeNull();
    const changedInput: ProcessModelInput = {
      ...input,
      expectedOutcome: "Resolved with an auditable outcome"
    };
    const updated = await postgresProcessModelRepository.update(tenantA, processA, draft!.id, actorId, changedInput);
    expect(updated?.expectedOutcome).toBe(changedInput.expectedOutcome);
    expect(updated?.contentHash).not.toBe(draft?.contentHash);

    const confirmed = await postgresProcessModelRepository.confirm(tenantA, processA, draft!.id, actorId);
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.facts.find((fact) => fact.provenanceKind === "user_statement")?.reviewState).toBe("user_confirmed");
    expect(confirmed?.facts.find((fact) => fact.provenanceKind === "ai_hypothesis")?.reviewState).toBe("unreviewed");

    await expect(
      postgresProcessModelRepository.update(tenantA, processA, draft!.id, actorId, input)
    ).rejects.toThrow("Cannot update a process model while it is confirmed");

    await expect(pool.query(
      "UPDATE business_process_model_steps SET name='Tampered after confirmation' WHERE tenant_id=$1 AND model_version_id=$2",
      [tenantA, draft!.id]
    )).rejects.toMatchObject({ code: "55000" });

    const published = await postgresProcessModelRepository.publish(tenantA, processA, draft!.id, actorId);
    expect(published?.status).toBe("published");

    await expect(pool.query(
      "UPDATE business_process_model_versions SET purpose='Tampered after publication' WHERE tenant_id=$1 AND id=$2",
      [tenantA, draft!.id]
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("records explicit fact review decisions and refuses review after confirmation", async () => {
    const draft = await postgresProcessModelRepository.create(tenantA, processA, actorId, input);
    const fact = draft!.facts.find((item) => item.provenanceKind === "ai_hypothesis")!;
    const reviewed = await postgresProcessModelRepository.reviewFact(
      tenantA, processA, draft!.id, fact.id, actorId, "disputed"
    );
    expect(reviewed?.reviewState).toBe("disputed");
    await postgresProcessModelRepository.confirm(tenantA, processA, draft!.id, actorId);
    await expect(
      postgresProcessModelRepository.reviewFact(tenantA, processA, draft!.id, fact.id, actorId, "verified")
    ).rejects.toThrow("Cannot review facts for a process model while it is confirmed");
  });

  it("returns no model when the requested process belongs to another tenant", async () => {
    await expect(
      postgresProcessModelRepository.create(tenantA, processB, actorId, input)
    ).resolves.toBeNull();
  });
});
