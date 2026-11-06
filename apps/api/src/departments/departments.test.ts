import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal, IdentityVerifier } from "../auth/auth.js";
import { createApp } from "../app.js";
import type { Department, DepartmentRepository } from "./departments.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const principal: AuthenticatedPrincipal = {
  subject: "user-a",
  issuer: "https://identity.example.test",
  tenantId: tenantA,
  roles: ["tenant_admin"],
  permissions: ["departments:read", "departments:create", "departments:update"]
};
const department: Department = {
  id: departmentId,
  tenantId: tenantA,
  name: "Operations",
  description: null,
  createdAt: new Date("2026-11-06T00:00:00.000Z")
};

function createRepository(): DepartmentRepository {
  return {
    list: vi.fn().mockResolvedValue([department]),
    get: vi.fn().mockResolvedValue(department),
    create: vi.fn().mockResolvedValue(department),
    update: vi.fn().mockResolvedValue(department)
  };
}

function createVerifier(value: unknown = principal): IdentityVerifier {
  return { verify: vi.fn().mockResolvedValue(value) };
}

describe("tenant-scoped Departments API", () => {
  it("uses the verified tenant, ignoring a conflicting tenant header", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), repository))
      .get("/api/v1/departments")
      .set("x-tenant-id", tenantB);

    expect(response.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(tenantA);
  });

  it("does not allow a caller to choose tenant identity in the request body", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), repository))
      .post("/api/v1/departments")
      .send({ name: "Finance", tenantId: tenantB });

    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns 404 when a department is not visible inside the verified tenant", async () => {
    const repository = createRepository();
    vi.mocked(repository.get).mockResolvedValue(null);
    const response = await request(createApp(createVerifier(), repository))
      .get("/api/v1/departments/" + departmentId);

    expect(response.status).toBe(404);
    expect(repository.get).toHaveBeenCalledWith(tenantA, departmentId);
  });

  it("rejects requests when no verified principal exists", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(null), repository)).get("/api/v1/departments");

    expect(response.status).toBe(401);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("rejects callers without the required permission", async () => {
    const repository = createRepository();
    const limitedPrincipal = { ...principal, permissions: [] };
    const response = await request(createApp(createVerifier(limitedPrincipal), repository)).get("/api/v1/departments");

    expect(response.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("creates a department using the authenticated actor and tenant", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), repository))
      .post("/api/v1/departments")
      .send({ name: "Operations" });

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(tenantA, "user-a", { name: "Operations" });
  });

  it("validates UUID path parameters", async () => {
    const repository = createRepository();
    const response = await request(createApp(createVerifier(), repository)).get("/api/v1/departments/not-a-uuid");

    expect(response.status).toBe(400);
    expect(repository.get).not.toHaveBeenCalled();
  });
});
