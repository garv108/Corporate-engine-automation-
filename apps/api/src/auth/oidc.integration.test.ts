import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "../db/pool.js";
import { createOidcIdentityVerifier } from "./oidc.js";

const tenantId = randomUUID();
const issuer = "https://identity.integration.test";
const subject = "oidc-integration-subject";
const options = {
  issuer,
  audience: "cias-api-integration",
  jwksUrl: "https://identity.integration.test/.well-known/jwks.json",
  tenantClaim: "cias_tenant_id"
};

function requestWithBearer(): Request {
  return { get: vi.fn().mockReturnValue("Bearer integration-test-token") } as unknown as Request;
}

describe("OIDC tenant membership PostgreSQL integration", () => {
  beforeAll(async () => {
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, 'OIDC integration tenant')", [tenantId]);
    await pool.query(
      "INSERT INTO tenant_memberships (tenant_id, issuer, subject, status, roles, permissions) VALUES ($1, $2, $3, 'active', $4, $5)",
      [tenantId, issuer, subject, ["tenant_admin"], ["departments:read", "opportunities:read"]]
    );
  }, 15_000);

  afterAll(async () => {
    await pool.query("DELETE FROM tenant_memberships WHERE tenant_id = $1", [tenantId]);
    await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  }, 15_000);

  it("creates a principal from a verified identity and active database membership", async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      sub: subject,
      iss: issuer,
      aud: options.audience,
      cias_tenant_id: tenantId,
      permissions: ["admin:*"]
    });
    const verifier = createOidcIdentityVerifier(options, { verifyToken });

    await expect(verifier.verify(requestWithBearer())).resolves.toEqual({
      subject,
      issuer,
      tenantId,
      roles: ["tenant_admin"],
      permissions: ["departments:read", "opportunities:read"]
    });
  });

  it("rejects a membership after it is suspended", async () => {
    await pool.query(
      "UPDATE tenant_memberships SET status = 'suspended' WHERE tenant_id = $1 AND issuer = $2 AND subject = $3",
      [tenantId, issuer, subject]
    );

    const verifier = createOidcIdentityVerifier(options, {
      verifyToken: async () => ({ sub: subject, iss: issuer, aud: options.audience, cias_tenant_id: tenantId })
    });

    await expect(verifier.verify(requestWithBearer())).resolves.toBeNull();

    await pool.query(
      "UPDATE tenant_memberships SET status = 'active' WHERE tenant_id = $1 AND issuer = $2 AND subject = $3",
      [tenantId, issuer, subject]
    );
  });
});
