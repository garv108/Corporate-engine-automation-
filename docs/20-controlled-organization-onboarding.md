# Controlled Organization Onboarding — M3-B

## Decision

CIAS uses controlled, platform-managed organization onboarding. Public organization signup and self-service tenant creation are not part of this milestone.

## Trust boundaries

1. A platform operator is an identity (exact OIDC issuer + immutable subject) explicitly allowlisted by a trusted database administrator in `cias_platform_operators`.
2. The operator authenticates to the provisioning command with a signed OIDC access token. The command verifies signature, issuer, audience, token type, expiry and required access-token claims using the configured HTTPS JWKS endpoint.
3. The command checks the operator allowlist inside the same database transaction used for provisioning.
4. It creates the tenant and the first active `organization_admin` membership atomically.
5. The initial administrator is identified by an immutable OIDC subject supplied to the trusted command. The command does not create an identity-provider account, send an invitation, or assume that the subject already has a CIAS token.
6. Normal API access still requires a signed tenant claim plus an active tenant membership. Roles and permissions are loaded from the database, never from token-supplied authorization claims.

## Provisioning workflow

`trusted DBA allowlists platform operator → operator obtains OIDC access token → operator runs provisioning command → tenant + initial membership + audit commit atomically → identity provider maps admin subject to tenant claim → admin signs in → admin onboards departments and employee profiles`

The command is intentionally out-of-band. There is no HTTP route that creates tenants, grants the platform-owner role, or changes membership permissions.

## Platform operator bootstrap

After applying migration `012_controlled_organization_onboarding.sql`, a trusted database administrator inserts the first platform operator through a secured database session:

```sql
INSERT INTO cias_platform_operators (issuer, subject, created_by)
VALUES ('https://YOUR-ISSUER', 'IMMUTABLE-OPERATOR-SUBJECT', 'DBA-CHANGE-REFERENCE');
```

Do not expose this table to the application runtime role for arbitrary writes. In production, separate migration, provisioning and application database roles. The provisioning role needs only SELECT on `cias_platform_operators`, INSERT on `tenants`, `tenant_memberships` and `audit_events`, plus the minimum sequence/function privileges required by those inserts and audit triggers. It must not be able to add or modify platform operators. The API runtime role must not be able to create tenants or memberships. Operator allowlisting and revocation remain DBA-controlled.

## Provisioning command

From the repository root, after migration and identity-provider configuration:

```bash
CIAS_PLATFORM_OPERATOR_TOKEN='SHORT-LIVED-ACCESS-TOKEN' pnpm --filter @cias/api db:provision-organization -- --name "Example Organization" --admin-subject "IMMUTABLE-ADMIN-SUBJECT"
```

Set `CIAS_PROVISIONING_DATABASE_URL` to a dedicated restricted database role (do not reuse the API runtime role) and `CIAS_PLATFORM_OPERATOR_TOKEN` to a short-lived access token. The token is read from the environment and is never printed. Prefer injecting both values from a local secret manager rather than shell history. The command prints only the created tenant ID, name, status and initial admin subject/role.

## Initial administrator permission profile

The initial `organization_admin` membership receives tenant-scoped permissions for departments, process catalogue, discovery, opportunity assessment and workforce onboarding. High-impact workflow publication and opportunity approval are deliberately excluded. A later governance milestone must define separate approver roles and dual-control rules before these permissions are granted.

The role label is descriptive; authorization is enforced by the membership's explicit permission array. The profile is versioned in code as `organization_admin_m3b_v1`. Permission changes must be reviewed and audited.

## Lifecycle and operational policy

- New organizations are created as `active` only after a verified platform operator invokes the provisioning command.
- Suspending a tenant blocks OIDC authentication because the identity adapter joins memberships to an active tenant.
- Suspending/revoking a membership blocks that identity without deleting employee records.
- Deprovisioning is suspension-first. Tenant deletion and cascading data erasure are not part of this milestone.
- Tenant creation, operator allowlist changes, and initial organization provisioning are audited. Membership changes retain the existing database audit trigger.
- Tenant data is synthetic in development. Do not import live employee data before retention, privacy classification, access review and backup/restore controls are approved.

## Explicitly not implemented

- Public organization registration or approval queues.
- Admin invitation email delivery or identity-provider account creation.
- Self-service role/permission management.
- Platform operator web UI or HTTP endpoints.
- Tenant deletion, billing, subscription provisioning or data export.
- Frontend onboarding wizard.

## Verification required in Codespaces

Run `pnpm db:migrate`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then exercise the provisioning command against a disposable PostgreSQL database with a synthetic OIDC issuer/JWKS and synthetic platform-operator/admin subjects. Verify rollback on invalid admin membership data, non-operator denial, duplicate provisioning behavior, audit records, and that no public API route can create tenants.
