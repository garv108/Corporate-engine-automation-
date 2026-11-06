import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { createOidcIdentityVerifier } from "./oidc.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const options = {
  issuer: "https://identity.example.test",
  audience: "cias-api",
  jwksUrl: "https://identity.example.test/.well-known/jwks.json",
  tenantClaim: "cias_tenant_id"
};

function requestWithAuthorization(value: string): Request {
  return { get: vi.fn().mockReturnValue(value) } as unknown as Request;
}

describe("OIDC identity verifier", () => {
  it("uses verified claims and active database membership as the principal source", async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      sub: "external-user-42",
      iss: options.issuer,
      aud: options.audience,
      cias_tenant_id: tenantId,
      permissions: ["admin:*"]
    });
    const findMembership = vi.fn().mockResolvedValue({
      roles: ["tenant_admin"],
      permissions: ["departments:read", "business_processes:read"]
    });
    const verifier = createOidcIdentityVerifier(options, { verifyToken, findMembership });

    const principal = await verifier.verify(requestWithAuthorization("Bearer signed.jwt.token"));

    expect(verifyToken).toHaveBeenCalledWith("signed.jwt.token");
    expect(findMembership).toHaveBeenCalledWith(tenantId, options.issuer, "external-user-42");
    expect(principal).toEqual({
      subject: "external-user-42",
      issuer: options.issuer,
      tenantId,
      roles: ["tenant_admin"],
      permissions: ["departments:read", "business_processes:read"]
    });
  });

  it("does not trust permissions embedded in the token", async () => {
    const verifier = createOidcIdentityVerifier(options, {
      verifyToken: async () => ({
        sub: "external-user-42",
        iss: options.issuer,
        cias_tenant_id: tenantId,
        permissions: ["admin:*"]
      }),
      findMembership: async () => ({ roles: ["viewer"], permissions: ["departments:read"] })
    });

    const principal = await verifier.verify(requestWithAuthorization("Bearer signed.jwt.token"));
    expect(principal).toMatchObject({ permissions: ["departments:read"], roles: ["viewer"] });
  });

  it("rejects tokens without an active tenant membership", async () => {
    const findMembership = vi.fn().mockResolvedValue(null);
    const verifier = createOidcIdentityVerifier(options, {
      verifyToken: async () => ({ sub: "external-user-42", iss: options.issuer, cias_tenant_id: tenantId }),
      findMembership
    });

    await expect(verifier.verify(requestWithAuthorization("Bearer signed.jwt.token"))).resolves.toBeNull();
    expect(findMembership).toHaveBeenCalledOnce();
  });

  it("rejects an invalid tenant claim before querying membership", async () => {
    const findMembership = vi.fn();
    const verifier = createOidcIdentityVerifier(options, {
      verifyToken: async () => ({ sub: "external-user-42", iss: options.issuer, cias_tenant_id: "tenant-b" }),
      findMembership
    });

    await expect(verifier.verify(requestWithAuthorization("Bearer signed.jwt.token"))).resolves.toBeNull();
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed bearer credentials", async () => {
    const verifyToken = vi.fn();
    const verifier = createOidcIdentityVerifier(options, { verifyToken });

    await expect(verifier.verify(requestWithAuthorization(""))).resolves.toBeNull();
    await expect(verifier.verify(requestWithAuthorization("Basic abc123"))).resolves.toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("fails closed when token verification throws", async () => {
    const verifier = createOidcIdentityVerifier(options, {
      verifyToken: async () => { throw new Error("invalid signature"); },
      findMembership: vi.fn()
    });

    await expect(verifier.verify(requestWithAuthorization("Bearer invalid.token"))).resolves.toBeNull();
  });
});
