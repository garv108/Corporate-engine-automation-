import "dotenv/config";
import { createRemoteJWKSet } from "jose";
import pg from "pg";
import { config } from "../config.js";
import { verifyOidcAccessToken } from "../auth/oidc.js";
import { provisionOrganization } from "./organization-provisioning.js";

const { Pool } = pg;
const provisioningDatabaseUrl = process.env.CIAS_PROVISIONING_DATABASE_URL;
if (!provisioningDatabaseUrl) {
  throw new Error("CIAS_PROVISIONING_DATABASE_URL must point to the restricted provisioning database role");
}
const pool = new Pool({ connectionString: provisioningDatabaseUrl, max: 1 });

function parseArguments(args: string[]): { name: string; adminSubject: string } {
  const values = new Map<string, string>();
  const allowed = new Set(["--name", "--admin-subject"]);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !allowed.has(flag)) {
      throw new Error(`Unexpected argument: ${flag ?? "(missing)"}`);
    }
    if (values.has(flag)) throw new Error(`Argument may only be supplied once: ${flag}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value.trim());
  }

  const name = values.get("--name");
  const adminSubject = values.get("--admin-subject");
  if (!name) throw new Error("Missing required argument: --name");
  if (!adminSubject) throw new Error("Missing required argument: --admin-subject");
  if (name.length < 2 || name.length > 200) throw new Error("--name must be 2–200 characters");
  if (adminSubject.length > 255) throw new Error("--admin-subject must be at most 255 characters");
  return { name, adminSubject };
}

async function main(): Promise<void> {
  const { name, adminSubject } = parseArguments(process.argv.slice(2));
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
    const result = await provisionOrganization(client, {
      name,
      issuer: config.OIDC_ISSUER,
      operatorSubject: claims.sub,
      adminSubject
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    client.release();
  }
}

try {
  await main();
} finally {
  await pool.end();
}
