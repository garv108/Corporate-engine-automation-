import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal, IdentityVerifier } from "../auth/auth.js";
import { createApp } from "../app.js";
import type { DiscoverySession, DiscoverySessionRepository } from "./discovery-sessions.js";
import { DiscoverySessionRevisionError } from "./discovery-sessions.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const permissions = [
  "process_discovery_sessions:read",
  "process_discovery_sessions:create",
  "process_discovery_sessions:update",
  "process_discovery_sessions:confirm"
];
const principal: AuthenticatedPrincipal = {
  subject: "user-a",
  issuer: "https://identity.example.test",
  tenantId: tenantA,
  roles: ["tenant_admin"],
  permissions
};

const session: DiscoverySession = {
  id: sessionId,
  tenantId: tenantA,
  status: "active",
  initialDescription: "We manually process internal service requests.",
  classification: "unknown",
  currentDraft: {
    purpose: null, scope: null, trigger: null, expectedOutcome: null,
    steps: [], transitions: [], evidence: [], uncertainties: [],
    context: {
      systems: [], inputs: [], outputs: [], decisions: [], exceptions: [],
      humanJudgement: null, volume: null, timing: null, baseline: null,
      dataHandling: null, constraints: []
    }
  },
  completeness: {
    state: "incomplete", canConfirm: false,
    requiredMissing: ["purpose", "trigger", "expectedOutcome", "steps"],
    recommendedMissing: ["scope"], blockingIssues: [], openUncertainties: []
  },
  currentQuestionId: "purpose",
  nextQuestion: {
    id: "purpose", fieldPath: "purpose", prompt: "What is the main purpose?",
    rationale: "The purpose defines why this process exists.", required: true
  },
  revision: 1,
  schemaVersion: 1,
  confirmedBy: null,
  confirmedAt: null,
  createdBy: "user-a",
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
  turns: [],
  factEvents: []
};

function createRepository(): DiscoverySessionRepository {
  return {
    create: vi.fn().mockResolvedValue(session),
    get: vi.fn().mockResolvedValue(session),
    list: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    turn: vi.fn().mockResolvedValue({
      ...session,
      status: "ready_for_review",
      revision: 2,
      completeness: { state: "ready_for_review", canConfirm: true, requiredMissing: [], recommendedMissing: [], blockingIssues: [], openUncertainties: [] },
      currentQuestionId: null,
      nextQuestion: null
    }),
    confirm: vi.fn().mockResolvedValue({ ...session, status: "confirmed", revision: 3, confirmedBy: "user-a" })
  };
}

function createVerifier(value: unknown = principal): IdentityVerifier {
  return { verify: vi.fn().mockResolvedValue(value) };
}

describe("Process Discovery Sessions API", () => {
  it("creates a durable session from a natural-language description and returns the next focused question", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, undefined, undefined, repository))
      .post("/api/v1/process-discovery/sessions")
      .set("x-tenant-id", tenantB)
      .send({ initialDescription: "We manually process internal service requests." });

    expect(response.status).toBe(201);
    expect(response.body.data.nextQuestion.id).toBe("purpose");
    expect(repository.create).toHaveBeenCalledWith(tenantA, "user-a", {
      initialDescription: "We manually process internal service requests.",
      factUpdates: []
    });
  });

  it("rejects caller-supplied tenant identity and malformed structured facts", async () => {
    const repository = createRepository();
    const wrongTenant = await request(createApp(createVerifier(), undefined, undefined, undefined, undefined, repository))
      .post("/api/v1/process-discovery/sessions")
      .send({ initialDescription: "We manually process internal service requests.", tenantId: tenantB });
    const badTurn = await request(createApp(createVerifier(), undefined, undefined, undefined, undefined, repository))
      .post("/api/v1/process-discovery/sessions/" + sessionId + "/turns")
      .send({ message: "Here is the answer", expectedRevision: 1, factUpdates: [{ fieldPath: "tenantId", value: tenantB }] });

    expect(wrongTenant.status).toBe(400);
    expect(badTurn.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.turn).not.toHaveBeenCalled();
  });

  it("records a structured answer and returns the updated completeness state", async () => {
    const repository = createRepository();
    const updates = [
      { fieldPath: "purpose", value: "Resolve internal service requests" },
      { fieldPath: "trigger", value: "A team submits a request" },
      { fieldPath: "expectedOutcome", value: "The request is resolved or returned with a reason" },
      { fieldPath: "steps", value: [{ key: "receive", kind: "start", name: "Receive request" }] }
    ];
    const response = await request(createApp(createVerifier(), undefined, undefined, undefined, undefined, repository))
      .post("/api/v1/process-discovery/sessions/" + sessionId + "/turns")
      .send({ message: "It starts when a team submits a request.", factUpdates: updates, expectedRevision: 1, answerToQuestionId: "purpose" });

    expect(response.status).toBe(200);
    expect(response.body.data.completeness.canConfirm).toBe(true);
    expect(response.body.data.status).toBe("ready_for_review");
    expect(repository.turn).toHaveBeenCalledWith(tenantA, sessionId, "user-a", expect.objectContaining({
      expectedRevision: 1,
      answerToQuestionId: "purpose",
      factUpdates: updates
    }));
  });

  it("rejects stale revisions and stale question IDs", async () => {
    const repository = createRepository();
    vi.mocked(repository.turn).mockRejectedValue(new DiscoverySessionRevisionError(2));
    const response = await request(createApp(createVerifier(), undefined, undefined, undefined, undefined, repository))
      .post("/api/v1/process-discovery/sessions/" + sessionId + "/turns")
      .send({
        message: "Answer",
        factUpdates: [{ fieldPath: "purpose", value: "Resolve requests" }],
        expectedRevision: 1,
        answerToQuestionId: "old-question"
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("REVISION_CONFLICT");
  });

  it("requires a separate permission to confirm a discovery snapshot", async () => {
    const repository = createRepository();
    const limited = { ...principal, permissions: permissions.filter((item) => item !== "process_discovery_sessions:confirm") };
    const response = await request(createApp(createVerifier(limited), undefined, undefined, undefined, undefined, repository))
      .post("/api/v1/process-discovery/sessions/" + sessionId + "/confirm")
      .send({ expectedRevision: 2 });

    expect(response.status).toBe(403);
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it("requires authentication before a session can be read", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(null), undefined, undefined, undefined, undefined, repository))
      .get("/api/v1/process-discovery/sessions/" + sessionId);

    expect(response.status).toBe(401);
    expect(repository.get).not.toHaveBeenCalled();
  });
});
