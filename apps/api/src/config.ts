import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH ?? fileURLToPath(new URL("../../../.env", import.meta.url))
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().default("postgresql://cias:cias_dev_password@localhost:5432/cias"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().trim().min(1).optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  OIDC_TENANT_CLAIM: z.string().regex(/^[A-Za-z0-9_:-]{1,100}$/).default("cias_tenant_id")
}).superRefine((value, context) => {
  const configured = [value.OIDC_ISSUER, value.OIDC_AUDIENCE, value.OIDC_JWKS_URL].filter(Boolean).length;
  if (configured !== 0 && configured !== 3) {
    context.addIssue({
      code: "custom",
      message: "OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL must be configured together"
    });
  }

  if (value.OIDC_ISSUER && new URL(value.OIDC_ISSUER).protocol !== "https:") {
    context.addIssue({
      code: "custom",
      path: ["OIDC_ISSUER"],
      message: "OIDC_ISSUER must use HTTPS"
    });
  }

  if (value.OIDC_JWKS_URL && new URL(value.OIDC_JWKS_URL).protocol !== "https:") {
    context.addIssue({
      code: "custom",
      path: ["OIDC_JWKS_URL"],
      message: "OIDC_JWKS_URL must use HTTPS"
    });
  }
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

if (parsed.data.NODE_ENV === "production") {
  const missing = [
    "DATABASE_URL",
    "CORS_ORIGIN",
    "OIDC_ISSUER",
    "OIDC_AUDIENCE",
    "OIDC_JWKS_URL"
  ].filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

export const config = parsed.data;
