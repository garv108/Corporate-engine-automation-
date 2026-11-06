import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  authenticationMiddleware,
  requirePermission,
  type AuthenticatedPrincipal,
  type IdentityVerifier
} from "./auth.js";

const principal: AuthenticatedPrincipal = {
  subject: "user-123",
  issuer: "https://identity.example.test",
  tenantId: "11111111-1111-4111-8111-111111111111",
  roles: ["tenant_admin"],
  permissions: ["departments:read"]
};

function createApp(verifier: IdentityVerifier) {
  const app = express();
  app.use(authenticationMiddleware(verifier));
  app.get("/departments", requirePermission("departments:read"), (_request, response) => {
    response.json({ data: [] });
  });
  return app;
}

describe("authentication and authorization boundary", () => {
  it("fails closed when no verified identity is returned", async () => {
    const verifier: IdentityVerifier = { verify: vi.fn().mockResolvedValue(null) };
    const response = await request(createApp(verifier))
      .get("/departments")
      .set("x-tenant-id", principal.tenantId);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects malformed verified principal claims", async () => {
    const verifier: IdentityVerifier = {
      verify: vi.fn().mockResolvedValue({ ...principal, tenantId: "not-a-uuid" })
    };
    const response = await request(createApp(verifier)).get("/departments");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("allows a verified principal with the required permission", async () => {
    const verifier: IdentityVerifier = { verify: vi.fn().mockResolvedValue(principal) };
    const response = await request(createApp(verifier)).get("/departments");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("rejects a verified principal without the required permission", async () => {
    const verifier: IdentityVerifier = {
      verify: vi.fn().mockResolvedValue({ ...principal, permissions: [] })
    };
    const response = await request(createApp(verifier)).get("/departments");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("fails closed if the identity verifier throws", async () => {
    const verifier: IdentityVerifier = {
      verify: vi.fn().mockRejectedValue(new Error("invalid token"))
    };
    const response = await request(createApp(verifier)).get("/departments");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});
