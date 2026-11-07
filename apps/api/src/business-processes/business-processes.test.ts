import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal, IdentityVerifier } from "../auth/auth.js";
import { createApp } from "../app.js";
import type { BusinessProcess, BusinessProcessRepository } from "./business-processes.js";
import { encodePaginationCursor } from "../pagination/cursor-pagination.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const processId = "33333333-3333-4333-8333-333333333333";
const departmentInTenantB = "44444444-4444-4444-8444-444444444444";
const principal: AuthenticatedPrincipal = {
  subject: "user-a",
  issuer: "https://identity.example.test",
  tenantId: tenantA,
  roles: ["tenant_admin"],
  permissions: ["business_processes:read", "business_processes:create", "business_processes:update"]
};
const businessProcess: BusinessProcess = {
  id: processId,
  tenantId: tenantA,
  departmentId: null,
  name: "Invoice processing",
  description: null,
  systems: ["ERP"],
  inputs: ["Supplier invoice"],
  outputs: ["Payment instruction"],
  sensitivity: "unknown"
};

function createRepository(): BusinessProcessRepository {
  return {
    list: vi.fn().mockResolvedValue({ items: [businessProcess], hasMore: false }),
    get: vi.fn().mockResolvedValue(businessProcess),
    create: vi.fn().mockResolvedValue(businessProcess),
    update: vi.fn().mockResolvedValue(businessProcess)
  };
}
function createVerifier(value: unknown = principal): IdentityVerifier {
  return { verify: vi.fn().mockResolvedValue(value) };
}

describe("tenant-scoped Business Processes API", () => {
  it("scopes list requests to the verified tenant and ignores a conflicting tenant header", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, repository))
      .get("/api/v1/business-processes").set("x-tenant-id", tenantB);
    expect(response.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(tenantA, { limit: 50, after: null });
    expect(response.body.data).toEqual([businessProcess]);
    expect(response.body.pagination).toEqual({ limit: 50, nextCursor: null });
  });

  it("returns an opaque continuation cursor when another page exists", async () => {
    const repository = createRepository();
    vi.mocked(repository.list).mockResolvedValue({ items: [businessProcess], hasMore: true });
    const response = await request(createApp(createVerifier(), undefined, repository))
      .get("/api/v1/business-processes?limit=1");
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      limit: 1,
      nextCursor: encodePaginationCursor({ name: businessProcess.name, id: businessProcess.id })
    });
  });

  it("rejects invalid page sizes and malformed cursors", async () => {
    const repository = createRepository();
    const invalidLimit = await request(createApp(createVerifier(), undefined, repository))
      .get("/api/v1/business-processes?limit=101");
    const invalidCursor = await request(createApp(createVerifier(), undefined, repository))
      .get("/api/v1/business-processes?cursor=not-a-cursor");
    expect(invalidLimit.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("rejects an unsupported sensitivity classification", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, repository))
      .post("/api/v1/business-processes").send({ name: "Payroll", sensitivity: "top-secret-free-text" });
    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("does not allow a caller to choose tenant identity in the request body", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, repository))
      .post("/api/v1/business-processes").send({ name: "Payroll", tenantId: tenantB });
    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns 404 for a process outside the verified tenant", async () => {
    const repository = createRepository();
    vi.mocked(repository.get).mockResolvedValue(null);
    const response = await request(createApp(createVerifier(), undefined, repository))
      .get("/api/v1/business-processes/" + processId);
    expect(response.status).toBe(404);
    expect(repository.get).toHaveBeenCalledWith(tenantA, processId);
  });

  it("does not update a process outside the verified tenant", async () => {
    const repository = createRepository();
    vi.mocked(repository.update).mockResolvedValue(null);
    const response = await request(createApp(createVerifier(), undefined, repository))
      .patch("/api/v1/business-processes/" + processId).send({ name: "Changed name" });
    expect(response.status).toBe(404);
    expect(repository.update).toHaveBeenCalledWith(tenantA, processId, "user-a", { name: "Changed name" });
  });

  it("rejects requests when no verified principal exists", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(null), undefined, repository))
      .get("/api/v1/business-processes");
    expect(response.status).toBe(401);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("rejects callers without the required permission", async () => {
    const repository = createRepository();
    const limitedPrincipal = { ...principal, permissions: [] };
    const response = await request(createApp(createVerifier(limitedPrincipal), undefined, repository))
      .get("/api/v1/business-processes");
    expect(response.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("creates a process with the authenticated tenant and actor", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), undefined, repository))
      .post("/api/v1/business-processes").send({ name: "Invoice processing", systems: ["ERP"] });
    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(tenantA, "user-a", {
      name: "Invoice processing", systems: ["ERP"]
    });
  });

  it("rejects a department reference rejected by the tenant-integrity constraint", async () => {
    const repository = createRepository();
    vi.mocked(repository.create).mockRejectedValue({ code: "23503" });
    const response = await request(createApp(createVerifier(), undefined, repository))
      .post("/api/v1/business-processes").send({ name: "Payroll", departmentId: departmentInTenantB });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_DEPARTMENT");
  });

  it("passes unexpected database failures to the centralized error handler", async () => {
    const repository = createRepository();
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(repository.create).mockRejectedValue(new Error("database unavailable"));
    try {
      const response = await request(createApp(createVerifier(), undefined, repository))
        .post("/api/v1/business-processes").send({ name: "Invoice processing" });
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("INTERNAL_ERROR");
      expect(logger).toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });
});
