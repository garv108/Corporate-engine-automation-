import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal, IdentityVerifier } from "../auth/auth.js";
import { createApp } from "../app.js";
import { encodePaginationCursor } from "../pagination/cursor-pagination.js";
import {
  OpportunityStatusTransitionError,
  type AutomationOpportunity,
  type AutomationOpportunityRepository
} from "./opportunities.js";

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
  impactEstimate: {},
  evidenceRefs: [],
  status: "discovered"
};

function createRepository(): AutomationOpportunityRepository {
  return {
    list: vi.fn().mockResolvedValue({ items: [opportunity], hasMore: false }),
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
    expect(repository.list).toHaveBeenCalledWith(tenantA, { limit: 50, after: null });
    expect(response.body.pagination).toEqual({ limit: 50, nextCursor: null });
  });


  it("returns an opaque cursor when another opportunity page exists", async () => {
    const repository = createRepository();
    vi.mocked(repository.list).mockResolvedValue({ items: [opportunity], hasMore: true });
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .get("/api/v1/opportunities?limit=1");

    expect(response.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(tenantA, { limit: 1, after: null });
    expect(response.body.pagination).toEqual({
      limit: 1,
      nextCursor: encodePaginationCursor({ name: opportunity.title, id: opportunity.id })
    });
  });

  it("rejects invalid opportunity pagination parameters", async () => {
    const repository = createRepository();
    const invalidLimit = await request(createApp(createVerifier(), undefined, undefined, repository))
      .get("/api/v1/opportunities?limit=101");
    const invalidCursor = await request(createApp(createVerifier(), undefined, undefined, repository))
      .get("/api/v1/opportunities?cursor=not-a-cursor");

    expect(invalidLimit.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    expect(repository.list).not.toHaveBeenCalled();
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

  it("rejects caller-supplied scores until a versioned assessment method exists", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .post("/api/v1/opportunities")
      .send({
        title: "Invoice automation",
        problemStatement: "Manual invoice entry creates repetitive work",
        impactScore: 99,
        confidence: 0.99
      });

    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects unsupported lifecycle labels", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .patch("/api/v1/opportunities/" + opportunityId)
      .send({ status: "active" });

    expect(response.status).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("returns a conflict when an opportunity skips a lifecycle stage", async () => {
    const repository = createRepository();
    vi.mocked(repository.update).mockRejectedValue(
      new OpportunityStatusTransitionError("discovered", "approved_for_design")
    );
    const response = await request(createApp(createVerifier(), undefined, undefined, repository))
      .patch("/api/v1/opportunities/" + opportunityId)
      .send({ status: "approved_for_design" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });
});
