# API Contracts — `/api/v1`
- GET `/departments`
- GET `/departments/{id}/processes`
- POST `/research/tasks`
- GET `/research/tasks/{id}`
- GET `/research/reports/{id}`
- GET `/opportunities`
- POST `/opportunities/discover`
- GET `/capabilities`
- GET `/capabilities/{id}/schema`
- POST `/workflow-projects`
- POST `/workflow-projects/{id}/clarifications`
- POST `/workflow-projects/{id}/generate`
- POST `/workflow-projects/{id}/validate`
- POST `/workflow-projects/{id}/sandbox-runs`
- POST `/workflow-projects/{id}/approval-requests`
- POST `/deployments/{id}/approve`
- POST `/deployments/{id}/reject`
- GET `/executions`
- GET `/analytics/overview`

Rules: enforce tenant scope server-side; cursor pagination; idempotency keys for task/execution/deployment; stable errors and correlation IDs; async resources for long jobs; never expose n8n admin credentials.


## Authentication and tenant context
- Protected routes require a verified `AuthenticatedPrincipal` created by the configured OIDC identity adapter.
- The adapter verifies JWT signatures using the configured JWKS endpoint and checks issuer, audience, and allowed signing algorithms.
- The signed `cias_tenant_id` claim identifies the requested tenant; an active `tenant_memberships` row must match issuer, subject, and tenant before a principal is created.
- Roles and permissions are loaded from the membership record, never trusted from token-supplied permission claims.
- Tenant context is derived from the verified principal; `x-tenant-id` and other caller-controlled headers are never proof of tenant membership.
- Missing, malformed, expired, unverifiable, or unprovisioned identities fail closed with HTTP 401. Missing permission returns HTTP 403.
- OIDC is provider-neutral. No identity provider is selected or connected; production configuration is supplied later through environment variables.

## Implemented tenant-scoped domain routes
- GET/POST `/departments`; GET/PATCH `/departments/{id}`
- GET/POST `/business-processes`; GET/PATCH `/business-processes/{id}`
- GET/POST `/opportunities`; GET/PATCH `/opportunities/{id}`
