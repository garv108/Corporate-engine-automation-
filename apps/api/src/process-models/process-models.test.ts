import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal, IdentityVerifier } from "../auth/auth.js";
import { createApp } from "../app.js";
import {
  ProcessModelStateError,
  type ProcessModel,
  type ProcessModelRepository
} from "./process-models.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const processId = "33333333-3333-4333-8333-333333333333";
const modelId = "44444444-4444-4444-8444-444444444444";
const factId = "55555555-5555-4555-8555-555555555555";

const permissions = [
  "business_process_models:read",
  "business_process_models:create",
  "business_process_models:update",
  "business_process_models:confirm",
  "business_process_models:publish",
  "business_process_models:review_facts"
];

const principal: AuthenticatedPrincipal = {
  subject: "user-a",
  issuer: "https://identity.example.test",
  tenantId: tenantA,
  roles: ["tenant_admin"],
  permissions
};

const model: ProcessModel = {
  id: modelId,
  tenantId: tenantA,
  processId,
  version: 1,
  status: "draft",
  purpose: "Process customer requests",
  scope: null,
  trigger: "A request is received",
  expectedOutcome: "A resolved request",
  schemaVersion: 1,
  contentHash: "a".repeat(64),
  confirmedBy: null,
  confirmedAt: null,
  publishedBy: null,
  publishedAt: null,
  createdBy: "user-a",
  updatedBy: "user-a",
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
  steps: [{
    id: "66666666-6666-4666-8666-666666666666",
    key: "receive",
    kind: "start",
    name: "Receive request",
    participant: { kind: "unknown" },
    systems: [],
    inputs: [],
    outputs: [],
    rules: [],
    exceptions: []
  }],
  transitions: [],
  evidence: [],
  facts: []
};

const validInput = {
  purpose: "Process customer requests",
  trigger: "A request is received",
  expectedOutcome: "A resolved request",
  steps: [{ key: "receive", kind: "start", name: "Receive request" }]
};

function createRepository(): ProcessModelRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(model),
    create: vi.fn().mockResolvedValue(model),
    update: vi.fn().mockResolvedValue(model),
    confirm: vi.fn().mockResolvedValue({ ...model, status: "confirmed" }),
    publish: vi.fn().mockResolvedValue({ ...model, status: "published" }),
    reviewFact: vi.fn().mockResolvedValue({
      id: factId,
      fieldPath: "steps.receive.purpose",
      value: "Receive request",
      provenanceKind: "user_statement",
      reviewState: "user_confirmed",
      stepId: null,
      evidenceId: null,
      recordedBy: "user-a",
      recordedAt: "2026-11-07T00:00:00.000Z"
    })
  };
}

function createVerifier(value: unknown = principal): IdentityVerifier {
  return { verify: vi.fn().mockResolvedValue(value) };
}

describe("tenant-scoped Process Models API", () => {
  it("creates a model using the verified tenant and actor, and ignores tenant headers", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, undefined, repository))
      .post("/api/v1/business-processes/" + processId + "/models")
      .set("x-tenant-id", tenantB)
      .send(validInput);

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(tenantA, processId, "user-a", expect.objectContaining({
      purpose: "Process customer requests",
      steps: [expect.objectContaining({ key: "receive", systems: [], inputs: [] })]
    }));
  });

  it("rejects caller-supplied tenant IDs and invalid transition references", async () => {
    const repository = createRepository();
    const tenantResponse = await request(createApp(createVerifier(), undefined, undefined, undefined, repository))
      .post("/api/v1/business-processes/" + processId + "/models")
      .send({ ...validInput, tenantId: tenantB });
    const transitionResponse = await request(createApp(createVerifier(), undefined, undefined, undefined, repository))
      .post("/api/v1/business-processes/" + processId + "/models")
      .send({
        ...validInput,
        transitions: [{ fromStepKey: "receive", toStepKey: "missing", kind: "sequence" }]
      });

    expect(tenantResponse.status).toBe(400);
    expect(transitionResponse.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("does not allow an update to a confirmed model version", async () => {
    const repository = createRepository();
    vi.mocked(repository.update).mockRejectedValue(new ProcessModelStateError("confirmed", "update"));
    const response = await request(createApp(createVerifier(), undefined, undefined, undefined, repository))
      .put("/api/v1/business-processes/" + processId + "/models/" + modelId)
      .send(validInput);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_MODEL_STATE");
  });

  it("requires a distinct permission to confirm a model", async () => {
    const repository = createRepository();
    const noConfirm = { ...principal, permissions: permissions.filter((item) => item !== "business_process_models:confirm") };
    const response = await request(createApp(createVerifier(noConfirm), undefined, undefined, undefined, repository))
      .post("/api/v1/business-processes/" + processId + "/models/" + modelId + "/confirm");

    expect(response.status).toBe(403);
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it("requires a separate verification permission for verified facts", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, undefined, repository))
      .post("/api/v1/business-processes/" + processId + "/models/" + modelId + "/facts/" + factId + "/review")
      .send({ reviewState: "verified" });

    expect(response.status).toBe(403);
    expect(repository.reviewFact).not.toHaveBeenCalled();
  });

  it("does not reveal a model to an unauthenticated caller", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(null), undefined, undefined, undefined, repository))
      .get("/api/v1/business-processes/" + processId + "/models/" + modelId);

    expect(response.status).toBe(401);
    expect(repository.get).not.toHaveBeenCalled();
  });

  it("lists versions only after tenant-scoped process lookup", async () => {
    const repository = createRepository();
    vi.mocked(repository.list).mockResolvedValue(null);
    const response = await request(createApp(createVerifier(), undefined, undefined, undefined, repository))
      .get("/api/v1/business-processes/" + processId + "/models");

    expect(response.status).toBe(404);
    expect(repository.list).toHaveBeenCalledWith(tenantA, processId);
  });
});
