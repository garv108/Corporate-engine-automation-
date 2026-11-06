import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal, IdentityVerifier } from "../auth/auth.js";
import { createApp } from "../app.js";
import type { AutomationOpportunity, AutomationOpportunityRepository } from "./opportunities.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const opportunityId = "33333333-3333-4333-8333-333333333333";
const processInTenantB = "44444444-4444-4444-8444-444444444444";
const principal: AuthenticatedPrincipal = {
  subject: "user-a",
  issuer: "https://identity.example.test",
  tenantId: tenantA,
  roles: ["tenant_admin"],
  permissions: ["opportunities:read", "opportunities:create", "opportunities:update"]
};
const opportunity: AutomationOpportunity = {
  id: opportunityId,
  tenantId: tenantA,
  departmentId: null,
  processId: null,
  title: "Invoice automation",
  problemStatement: "Manual invoice entry creates repetitive work",
  proposedOutcome: null,
  feasibilityScore: null,
  impactScore: null,
  complexityScore: null,
  confidence: null,
  impactEstimate: {},
  evidenceRefs: [],
  status: "discovered"
};

function createRepository(): AutomationOpportunityRepository {
  return {
    list: vi.fn().mockResolvedValue([opportunity]),
    get: vi.fn().mockResolvedValue(opportunity),
    create: vi.fn().mockResolvedValue(opportunity),
    update: vi.fn().mockResolvedValue(opportunity)
  };
}

function createVerifier(value: unknown = principal): IdentityVerifier {
  return { verify: vi.fn().mockResolvedValue(value) };
}

describe("tenant-scoped Automation Opportunities API", () => {
  it("scopes list requests to the verified tenant and ignores a conflicting tenant header", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .get("/api/v1/opportunities")
      .set("x-tenant-id", tenantB);

    expect(response.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(tenantA);
  });

  it("rejects tenant identity supplied in the request body", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .post("/api/v1/opportunities")
      .send({ title: "Payroll", problemStatement: "Manual processing", tenantId: tenantB });

    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns 404 for an opportunity outside the verified tenant", async () => {
    const repository = createRepository();
    vi.mocked(repository.get).mockResolvedValue(null);
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .get("/api/v1/opportunities/" + opportunityId);

    expect(response.status).toBe(404);
    expect(repository.get).toHaveBeenCalledWith(tenantA, opportunityId);
  });

  it("does not update an opportunity outside the verified tenant", async () => {
    const repository = createRepository();
    vi.mocked(repository.update).mockResolvedValue(null);
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .patch("/api/v1/opportunities/" + opportunityId)
      .send({ title: "Changed title" });

    expect(response.status).toBe(404);
    expect(repository.update).toHaveBeenCalledWith(tenantA, opportunityId, "user-a", { title: "Changed title" });
  });

  it("rejects unauthenticated callers", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(null), undefined, undefined, repository))
      .get("/api/v1/opportunities");

    expect(response.status).toBe(401);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("rejects callers without the required permission", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier({ ...principal, permissions: [] }), undefined, undefined, repository))
      .get("/api/v1/opportunities");

    expect(response.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("creates an opportunity using the authenticated tenant and actor", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .post("/api/v1/opportunities")
      .send({ title: "Invoice automation", problemStatement: "Manual invoice entry creates repetitive work" });

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(tenantA, "user-a", {
      title: "Invoice automation",
      problemStatement: "Manual invoice entry creates repetitive work"
    });
  });

  it("rejects a cross-tenant process association enforced by PostgreSQL", async () => {
    const repository = createRepository();
    vi.mocked(repository.create).mockRejectedValue({ code: "23503" });
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .post("/api/v1/opportunities")
      .send({
        title: "Payroll automation",
        problemStatement: "Manual payroll processing is repetitive",
        processId: processInTenantB
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ASSOCIATION");
  });

  it("validates numeric scores and UUID path parameters", async () => {
    const repository = createRepository();
    const invalidScore = await request(createApp(createVerifier(), undefined, undefined, repository))
      .post("/api/v1/opportunities")
      .send({ title: "Invoice automation", problemStatement: "Manual invoice entry creates repetitive work", impactScore: 120 });
    const invalidId = await request(createApp(createVerifier(), undefined, undefined, repository))
      .get("/api/v1/opportunities/not-a-uuid");

    expect(invalidScore.status).toBe(400);
    expect(invalidId.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.get).not.toHaveBeenCalled();
  });
});
