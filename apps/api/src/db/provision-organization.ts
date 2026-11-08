import "dotenv/config";
import { createRemoteJWKSet } from "jose";
import pg from "pg";
import { config } from "../config.js";
import { verifyOidcAccessToken } from "../auth/oidc.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
const args = process.argv.slice(2);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const name = required("--name");
  const adminSubject = required("--admin-subject");
  if (name.length < 2 || name.length > 200) throw new Error("--name must be 2–200 characters");
  if (adminSubject.length > 255) throw new Error("--admin-subject must be at most 255 characters");

  const token = process.env.CIAS_PLATFORM_OPERATOR_TOKEN;
  if (!token) throw new Error("CIAS_PLATFORM_OPERATOR_TOKEN is required");
  if (!config.OIDC_ISSUER || !config.OIDC_AUDIENCE || !config.OIDC_JWKS_URL) {
    throw new Error("OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL must be configured");
  }

  const jwks = createRemoteJWKSet(new URL(config.OIDC_JWKS_URL), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000
  });
  const claims = await verifyOidcAccessToken(token, jwks, {
    issuer: config.OIDC_ISSUER,
    audience: config.OIDC_AUDIENCE,
    jwksUrl: config.OIDC_JWKS_URL,
    tenantClaim: config.OIDC_TENANT_CLAIM
  });
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new Error("Verified operator token has no valid subject");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const operator = await client.query(
      "SELECT id FROM cias_platform_operators WHERE issuer = $1 AND subject = $2 AND status = 'active' FOR SHARE",
      [config.OIDC_ISSUER, claims.sub]
    );
    if (!operator.rows[0]) throw new Error("Caller is not an active CIAS platform operator");

    const tenant = await client.query(
      "INSERT INTO tenants (name, status) VALUES ($1, 'active') RETURNING id, name, status",
      [name]
    );
    const tenantId = tenant.rows[0].id as string;

    const organizationAdminPermissions = [
      "departments:read", "departments:create", "departments:update",
      "business_processes:read", "business_processes:create", "business_processes:update",
      "business_process_models:read", "business_process_models:create",
      "business_process_models:update", "business_process_models:confirm",
      "business_process_models:review_facts",
      "process_discovery_sessions:read", "process_discovery_sessions:create",
      "process_discovery_sessions:update", "process_discovery_sessions:confirm",
      "process_discovery_sessions:convert",
      "opportunities:read", "opportunities:create", "opportunities:update",
      "opportunities:evidence:create", "opportunities:interventions:create",
      "opportunities:interventions:update", "opportunities:assess",
      "workforce:employees:read", "workforce:employees:create",
      "workforce:skills:record", "workforce:tasks:read",
      "workforce:tasks:create", "workforce:tasks:update"
    ];

    const membership = await client.query(
      "INSERT INTO tenant_memberships (tenant_id, issuer, subject, status, roles, permissions) " +
      "VALUES ($1, $2, $3, 'active', ARRAY['organization_admin']::text[], $4::text[]) " +
      "RETURNING id",
      [tenantId, config.OIDC_ISSUER, adminSubject, organizationAdminPermissions]
    );

    await client.query(
      "INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata) " +
      "VALUES ($1, 'platform_operator', $2, 'organization.provisioned', 'tenant', $1::text, 'allowed', $3::jsonb)",
      [tenantId, claims.sub, JSON.stringify({
        organizationName: name,
        initialAdministratorMembershipId: membership.rows[0].id,
        initialRole: "organization_admin",
        permissionProfile: "organization_admin_m3b_v1"
      })]
    );
    await client.query("COMMIT");
    process.stdout.write(JSON.stringify({
      organization: { id: tenantId, name, status: "active" },
      initialAdministrator: { subject: adminSubject, role: "organization_admin" }
    }, null, 2) + "\n");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  await main();
} finally {
  await pool.end();
}
