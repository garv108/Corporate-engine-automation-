# Phase 2 — Tenant-Aware Core API and Data Layer

## Operating decision

Use a hybrid delivery model: local development and integration testing first; keep services containerized and cloud-portable. No hosted deployment or paid service is required in this phase.

## Goal

Deliver the first useful, secure CIAS domain slice: tenant-scoped departments and business processes, backed by versioned PostgreSQL migrations and a consistent API contract.

## Work sequence

### 2.1 Request and API foundations
- Add request/correlation IDs.
- Standardize success, validation, not-found, conflict and internal error responses.
- Add Zod validation and cursor pagination conventions.
- Separate route, service and repository responsibilities.

### 2.2 Identity and tenant boundary
- Define an authenticated principal contract with subject, tenant membership and permissions.
- Resolve tenant context only from a verified identity/session.
- Fail closed when identity is absent or invalid.
- Never trust a caller-supplied tenant ID as proof of access.
- Keep identity-provider integration behind an adapter. The hosted OIDC provider remains a deployment decision; no insecure development bypass is enabled in production.

### 2.3 First domain slice
- Departments: create, list, read and update.
- Business processes: create, list, read and update.
- Validate all request bodies and path identifiers.
- Apply tenant scope to every read and write.
- Enforce tenant-scoped uniqueness in PostgreSQL.

### 2.4 Persistence and audit
- Replace the one-off bootstrap migration with ordered, immutable migrations.
- Serialize migration execution and record checksums/version metadata.
- Add repository integration tests using PostgreSQL.
- Record audit events for domain mutations without logging secrets or sensitive payloads.

### 2.5 Verification
- Unit tests for validation, policy and service behavior.
- Integration tests proving tenant A cannot read or mutate tenant B data.
- CI runs typecheck, unit tests, PostgreSQL integration tests and production builds.
- Review migration rollback/recovery behavior and operational documentation.

## Explicitly out of scope
- n8n and LangGraph connections.
- External LLM calls or autonomous agents.
- Production deployment, customer data or live business-system credentials.
- Automatic production workflow execution.

## Exit criteria
Phase 2 is complete only when the tenant-isolation tests pass, protected endpoints fail closed, migrations are repeatable and serialized, audit events are emitted, and CI is green.

## Owner input required later
Before production identity integration: choose the identity provider (or confirm an existing company SSO/OIDC provider), required login methods, and initial hosting target. These choices do not block local implementation of the domain and authorization contracts.
