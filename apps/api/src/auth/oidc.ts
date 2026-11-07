import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey
} from "jose";
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
const allowedAlgorithms = ["RS256", "ES256"] as const;
const maxBearerTokenBytes = 16 * 1024;
const clockToleranceSeconds = 5;

export async function verifyOidcAccessToken(
  token: string,
  jwks: JWTVerifyGetKey,
  options: OidcVerifierOptions
): Promise<Record<string, unknown>> {
  if (Buffer.byteLength(token, "utf8") > maxBearerTokenBytes) {
    throw new Error("Bearer token exceeds the accepted size limit");
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: options.issuer,
    audience: options.audience,
    algorithms: [...allowedAlgorithms],
    typ: "at+jwt",
    requiredClaims: ["exp", "iat", "jti", "client_id", "sub"],
    clockTolerance: clockToleranceSeconds
  });

  const now = Date.now() / 1000;
  if (
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.sub.length > 255 ||
    typeof payload.client_id !== "string" ||
    payload.client_id.length === 0 ||
    payload.client_id.length > 255 ||
    typeof payload.jti !== "string" ||
    payload.jti.length === 0 ||
    payload.jti.length > 255 ||
    typeof payload.iat !== "number" ||
    !Number.isFinite(payload.iat) ||
    payload.iat > now + clockToleranceSeconds ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= payload.iat
  ) {
    throw new Error("JWT does not satisfy the CIAS access-token claim profile");
  }

  return payload as Record<string, unknown>;
}

export function createOidcIdentityVerifier(
  options: OidcVerifierOptions,
  dependencies: OidcVerifierDependencies = {}
): IdentityVerifier {
  const issuerUrl = new URL(options.issuer);
  const jwksUrl = new URL(options.jwksUrl);
  if (
    issuerUrl.protocol !== "https:" ||
    jwksUrl.protocol !== "https:" ||
    issuerUrl.username ||
    issuerUrl.password ||
    issuerUrl.search ||
    issuerUrl.hash ||
    jwksUrl.username ||
    jwksUrl.password ||
    jwksUrl.hash
  ) {
    throw new Error("OIDC issuer and JWKS URLs must be valid HTTPS URLs without credentials or fragments");
  }
  if (!options.audience.trim() || !options.tenantClaim.trim()) {
    throw new Error("OIDC audience and tenant claim must be configured");
  }

  const jwks = createRemoteJWKSet(jwksUrl, {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000
  });

  const verifyToken = dependencies.verifyToken ?? ((token: string) =>
    verifyOidcAccessToken(token, jwks, options)
  );

  const findMembership = dependencies.findMembership ?? (async (tenantId, issuer, subject) => {
    const result = await pool.query<OidcMembership>(
      "SELECT membership.roles, membership.permissions " +
      "FROM tenant_memberships AS membership " +
      "JOIN tenants AS tenant ON tenant.id = membership.tenant_id AND tenant.status = 'active' " +
      "WHERE membership.tenant_id = $1 AND membership.issuer = $2 AND membership.subject = $3 " +
      "AND membership.status = 'active' LIMIT 1",
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
        if (!claims) return null;
        const subject = claims.sub;
        const issuer = claims.iss;
        const tenantId = claims[options.tenantClaim];

        if (
          typeof subject !== "string" ||
          subject.length === 0 ||
          subject.length > 255 ||
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
