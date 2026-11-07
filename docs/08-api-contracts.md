# API Contracts — `/api/v1`

## Implemented tenant-scoped catalogue APIs

- GET `/departments?limit=50&cursor={opaqueCursor}`
- GET `/departments/{id}`
- POST `/departments`
- PATCH `/departments/{id}`
- GET `/business-processes?limit=50&cursor={opaqueCursor}`
- GET `/business-processes/{id}`
- POST `/business-processes`
- PATCH `/business-processes/{id}`

List endpoints use keyset pagination ordered by `name ASC, id ASC`. The default page size is 50 and the maximum is 100. A successful list response preserves the existing `data` array and adds:

```json
{
  "data": [],
  "pagination": {
    "limit": 50,
    "nextCursor": null
  }
}
```

Pass `nextCursor` unchanged as the next request's `cursor` query parameter. Cursors are opaque continuation positions, not authorization tokens. Tenant scope is re-derived from the verified principal on every request. Invalid page sizes or cursors return HTTP 400.

## Planned API surface

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

## Contract rules

- Enforce tenant scope server-side; caller-controlled tenant headers and body fields are never proof of membership.
- Use cursor pagination for collection endpoints.
- Use idempotency keys for task, execution and deployment commands that can cause side effects.
- Return stable error codes and correlation IDs; represent long-running work as asynchronous resources.
- Never expose n8n administrator credentials.

## Authentication and tenant context

- Protected routes require a verified `AuthenticatedPrincipal` created by a configured identity adapter.
- The principal contains the verified subject, issuer, internal tenant UUID, roles and permissions.
- Tenant context is derived from that principal; `x-tenant-id` and other caller-controlled headers are never proof of tenant membership.
- Missing, malformed, expired or unverifiable identity fails closed with HTTP 401. Missing permission returns HTTP 403.
- The identity adapter is intentionally provider-neutral. No provider is selected or connected yet; protected domain routes must not be enabled until a production-grade verifier and active-membership lookup are configured.
