# API Contracts — `/api/v1`

## Purpose

The CIAS REST API is the server-side contract used by the web application and, later, other clients such as desktop applications and approved integrations. It is an internal application interface unless a route is deliberately exposed to an authorized external integration. It is not the same thing as a paid third-party API.

The API keeps database access, authentication, tenant resolution, authorization, validation, business rules and audit writes on the server. Browser and desktop clients must never connect directly to PostgreSQL or hold n8n, model-provider or enterprise-system secrets.

## Implemented routes in the current repository slice

| Resource | Routes | Status |
|---|---|---|
| Health | `GET /api/v1/health` | Implemented |
| Departments | `GET/POST /departments`, `GET/PATCH /departments/{id}` | Implemented |
| Business processes | `GET/POST /business-processes`, `GET/PATCH /business-processes/{id}` | Implemented |
| Automation opportunities | `GET/POST /opportunities`, `GET/PATCH /opportunities/{id}` | Implemented as a basic persistence/API slice; not a complete discovery or workflow-library feature |

### Collection pagination

The Departments, Business Processes and Automation Opportunities list endpoints use keyset pagination:

- `?limit=50&cursor={opaqueCursor}`
- Default page size: 50; maximum page size: 100.
- Departments and Business Processes are ordered by `name ASC, id ASC`.
- Automation Opportunities are ordered by `title ASC, id ASC`.

A successful collection response preserves the `data` array and adds:

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

## Automation Opportunity contract

Opportunity status represents the business decision lifecycle only:

`discovered → qualified → alternatives_compared → business_case_drafted → approval_pending → approved_for_design`

`deferred` and `rejected` are explicit alternative outcomes. Transitions are validated server-side and invalid transitions return HTTP 409. Workflow proposal, workflow version, verification, production approval and execution have separate lifecycles.

Opportunity creation always begins in `discovered`. Moving to `approved_for_design` requires the separate `opportunities:approve` permission in addition to the general update permission. The current slice records this decision in the audit trail; a richer approval case with named approver, rationale and evidence will be added when the governance module is implemented. The API does not accept unexplained caller-supplied feasibility, impact, complexity or confidence scores as verified assessments. A future assessment record must include its scoring-method version, dimensions, evidence, assumptions, evaluator and timestamp. Evidence references are currently bounded strings; they are not yet normalized evidence relationships with referential integrity.

An opportunity can have several intervention candidates, including automation, process redesign, policy/approval simplification, training, capacity changes and data-quality remediation. It is not itself a workflow or permission to execute one.

## Planned contracts — not implemented yet

The following are design targets for the Work Mapping and Guided Discovery milestone and later phases, not claims about current route availability.

### Work map and guided discovery

- `POST /process-discovery/sessions` — create a discovery session from an initial description.
- `GET /process-discovery/sessions/{id}` — retrieve its state and current draft.
- `POST /process-discovery/sessions/{id}/turns` — submit an answer and receive the next focused question or completion explanation.
- `POST /process-discovery/sessions/{id}/confirm` — confirm the user-reviewed map.
- `GET /processes` — search confirmed process definitions.
- `POST /processes` — create a process definition/version from a confirmed map.
- `GET /processes/{id}/versions/{version}` — retrieve an immutable process version.

A discovery session must preserve conversation state, current structured facts, fact provenance, uncertainty, unresolved questions, schema version and user edits. A completeness gate must explain which required facts remain unknown. An AI statement must not be treated as an observed fact without user/system confirmation.

### Opportunity assessment

- `GET /opportunities/{id}/interventions`
- `POST /opportunities/{id}/interventions`
- `POST /opportunities/{id}/assessments`

### Workflow library and research

- `GET /workflow-library/assets`
- `POST /workflow-library/assets`
- `GET /workflow-library/assets/{id}`
- `GET /workflow-library/assets/{id}/versions`
- `POST /workflow-library/assets/{id}/versions`
- `POST /research/jobs`
- `GET /research/jobs/{id}`

Workflow assets should cover templates, packages, repositories, patterns, process blueprints and integration recipes. Artifact files are stored separately from relational metadata. External source material is untrusted and subject to source terms, licence, sanitization, deduplication and review.

### Recommendation and workflow engineering

- `POST /workflow-recommendations`
- `POST /workflow-projects`
- `POST /workflow-projects/{id}/clarifications`
- `POST /workflow-projects/{id}/generate`
- `POST /workflow-projects/{id}/validate`
- `POST /workflow-projects/{id}/sandbox-runs`
- `POST /workflow-projects/{id}/approval-requests`

### Governed execution — later milestone

- `POST /deployments/{id}/approve`
- `POST /deployments/{id}/reject`
- `GET /executions`
- `GET /executions/{id}`

Production dispatch must be tied to an exact immutable workflow artifact/version, configuration, capability versions, tenant scope, input contract, approval and idempotency key. A library asset or generated JSON file does not automatically have execution permission.

## API conventions

- Enforce tenant scope on every read, write, search, file access and asynchronous job.
- Derive tenant identity from the verified principal, never from caller-controlled tenant headers or body fields.
- Use cursor pagination for collection endpoints.
- Use idempotency keys for commands that may be retried or cause external effects.
- Use stable error codes, request/correlation IDs and structured validation errors.
- Represent long-running research, ingestion, generation and validation as durable asynchronous jobs.
- Use bounded timeouts, retries, backoff and explicit failure/reconciliation states.
- Never expose n8n administrator credentials, model-provider secrets or enterprise-system credentials.
- Record usage/cost attribution for model, search, storage, validation and workflow execution activities.
- Keep API contracts versioned; make breaking changes explicit and tested.

## Authentication and tenant context

- Protected routes require a verified `AuthenticatedPrincipal` created by a configured identity adapter.
- The principal contains the verified subject, issuer, internal tenant UUID, roles and permissions.
- Tenant context is derived from that principal; `x-tenant-id` and other caller-controlled headers are never proof of tenant membership.
- Missing, malformed, expired or unverifiable identity fails closed with HTTP 401. Missing permission returns HTTP 403.
- The identity adapter is intentionally provider-neutral. No provider is selected or connected yet; protected domain routes must not be enabled in production until a production-grade verifier and active-membership lookup are configured.
