import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request } from "express";
import { pool } from "../db/pool.js";
import type { IdentityVerifier } from "./auth.js";

export type OidcVerifierOptions = {
  issuer: string;
  audience: string;
  jwksUrl: string;
  tenantClaim: string;
};

export type OidcMembership = {
  roles: string[];
  permissions: string[];
};

export type OidcVerifierDependencies = {
  verifyToken?: (token: string) => Promise<Record<string, unknown> | null>;
  findMembership?: (tenantId: string, issuer: string, subject: string) => Promise<OidcMembership | null>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createOidcIdentityVerifier(
  options: OidcVerifierOptions,
  dependencies: OidcVerifierDependencies = {}
): IdentityVerifier {
  const issuerUrl = new URL(options.issuer);
  const jwksUrl = new URL(options.jwksUrl);
  if (issuerUrl.protocol !== "https:" || jwksUrl.protocol !== "https:") {
    throw new Error("OIDC issuer and JWKS URLs must use HTTPS");
  }
  const jwks = createRemoteJWKSet(jwksUrl);

  const verifyToken = dependencies.verifyToken ?? (async (token: string) => {
    const verified = await jwtVerify(token, jwks, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ["RS256", "ES256"]
    });
    return verified.payload as Record<string, unknown>;
  });

  const findMembership = dependencies.findMembership ?? (async (tenantId, issuer, subject) => {
    const result = await pool.query<OidcMembership>(
      "SELECT roles, permissions FROM tenant_memberships WHERE tenant_id = $1 AND issuer = $2 AND subject = $3 AND status = 'active' LIMIT 1",
      [tenantId, issuer, subject]
    );
    return result.rows[0] ?? null;
  });

  return {
    async verify(request: Request) {
      const authorization = request.get("authorization") ?? "";
      const match = /^Bearer\s+(\S+)$/i.exec(authorization);
      if (!match) return null;

      try {
        const claims = await verifyToken(match[1]!);
        const subject = claims.sub;
        const issuer = claims.iss;
        const tenantId = claims[options.tenantClaim];

        if (
          typeof subject !== "string" ||
          subject.length === 0 ||
          typeof issuer !== "string" ||
          issuer !== options.issuer ||
          typeof tenantId !== "string" ||
          !uuidPattern.test(tenantId)
        ) {
          return null;
        }

        const membership = await findMembership(tenantId, issuer, subject);
        if (!membership) return null;

        return {
          subject,
          issuer,
          tenantId,
          roles: membership.roles,
          permissions: membership.permissions
        };
      } catch {
        return null;
      }
    }
  };
}

export function createConfiguredIdentityVerifier(config: {
  OIDC_ISSUER?: string | undefined;
  OIDC_AUDIENCE?: string | undefined;
  OIDC_JWKS_URL?: string | undefined;
  OIDC_TENANT_CLAIM: string;
}): IdentityVerifier {
  if (!config.OIDC_ISSUER || !config.OIDC_AUDIENCE || !config.OIDC_JWKS_URL) {
    return { verify: async () => null };
  }

  return createOidcIdentityVerifier({
    issuer: config.OIDC_ISSUER,
    audience: config.OIDC_AUDIENCE,
    jwksUrl: config.OIDC_JWKS_URL,
    tenantClaim: config.OIDC_TENANT_CLAIM
  });
}
