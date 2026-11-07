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
| Process models | `GET/POST /business-processes/{processId}/models`, `GET/PUT /business-processes/{processId}/models/{modelVersionId}`, `POST .../{modelVersionId}/confirm`, `POST .../{modelVersionId}/publish`, `POST .../{modelVersionId}/facts/{factId}/review` | Implemented as the M1-A versioned process-map foundation |
| Process discovery sessions | `GET/POST /process-discovery/sessions`, `GET /process-discovery/sessions/{sessionId}`, `POST .../{sessionId}/turns`, `POST .../{sessionId}/confirm` | Implemented as the M1-B persistence and deterministic completeness foundation |
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

### Guided discovery — M1-B persistence and completeness foundation

Implemented routes:

- `GET /process-discovery/sessions` — list sessions using tenant-scoped keyset pagination.
- `POST /process-discovery/sessions` — create a session from an initial natural-language description; optional initial structured fact updates are accepted. Classification is system-set to unknown in this slice; the client cannot downgrade it. Downstream policy must handle unknown as restricted until an authorized classification process is implemented.
- `GET /process-discovery/sessions/{sessionId}` — resume a session with its turns, current draft, fact-event history, completeness result and next question.
- `POST /process-discovery/sessions/{sessionId}/turns` — append a user message and structured fact updates; supply the current revision and, when answering a specific prompt, its question ID.
- `POST /process-discovery/sessions/{sessionId}/confirm` — confirm a ready-for-review discovery snapshot using its current revision and explicitly acknowledge unresolved uncertainties when present.

The deterministic minimum completeness gate requires purpose, trigger, expected outcome and at least one valid process step. It reports optional recommended areas separately, including scope, systems/tools, inputs/outputs, decisions, exceptions, human judgement, volume, timing, baseline, data handling and constraints. The draft also preserves explicit unresolved uncertainty records, including the field affected and why the uncertainty matters. A missing optional detail is not automatically treated as a blocker or as proof that the process has no such detail.

Each structured answer is stored as a user turn and an append-only fact event with field path, value, source turn, provenance and review state. The session carries a system-set data classification (unknown by default); users cannot self-label it as public. Classification-aware access policy and retention controls remain prerequisites before sensitive workforce data is used. Corrections create a new fact event and supersede the previous current fact without deleting history. Revision checks reject stale submissions from concurrent sessions/tabs. Confirmation is blocked until the minimum gate is satisfied and freezes the snapshot. When unresolved uncertainty records exist, the caller must explicitly set acknowledgeUnresolved=true; the acknowledgement is recorded in the audit metadata.

**Current limitation:** this implementation does not call an LLM or extract facts from free text. The original description and user messages are retained verbatim; the caller must map structured answers to explicit field paths. This is intentional until a provider-neutral interview adapter is added and evaluated. No AI hypothesis is silently recorded as a confirmed fact. Confirmation does not publish an official process model or authorize automation.

The M1-A model routes remain separate: they store versioned process definitions under the Business Process Catalogue. Discovery-session confirmation is a reviewed snapshot, not a workflow approval or production authorization.

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

- Protected routes require a verified `AuthenticatedPrincipal` created by the configured identity adapter.
- The principal contains the verified subject, issuer, internal tenant UUID, roles and permissions.
- Tenant context is derived from that principal; `x-tenant-id` and other caller-controlled headers are never proof of tenant membership.
- Missing, malformed, expired or unverifiable identity fails closed with HTTP 401. Missing permission returns HTTP 403.
- When OIDC is configured, CIAS accepts only signed JWT access tokens matching the documented access-token profile. ID tokens and generic JWTs are not API credentials.
- OIDC signature verification uses HTTPS JWKS, issuer/audience validation, the RS256/ES256 allowlist and an explicit `at+jwt` protected-header type. The token must contain `sub`, `client_id`, `jti`, `iat` and `exp`.
- The signed tenant claim identifies the requested internal tenant, but access is granted only when an active `tenant_memberships` row matches tenant, issuer and subject and the tenant itself is active.
- Roles and permissions are loaded from the membership record, never from token-supplied role/permission claims.
- If the OIDC environment trio is unset in development, protected routes remain deny-by-default. Production startup requires OIDC issuer, audience and JWKS URL. No identity provider is selected or connected by this implementation.

See `docs/17-oidc-authentication.md` for the exact token profile, membership provisioning boundary and security behavior.
