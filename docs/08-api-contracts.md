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
- Protected routes require a verified `AuthenticatedPrincipal` created by a configured identity adapter.
- The principal contains the verified subject, issuer, internal tenant UUID, roles, and permissions.
- Tenant context is derived from that principal; `x-tenant-id` and other caller-controlled headers are never proof of tenant membership.
- Missing, malformed, expired, or unverifiable identity fails closed with HTTP 401. Missing permission returns HTTP 403.
- The identity adapter is intentionally provider-neutral. No provider is selected or connected yet; protected domain routes must not be enabled until a production-grade verifier and active-membership lookup are configured.
