# Phase 2 engineering audit — 6 November 2026

## Scope inspected
The Phase 2 branch was inspected across the API entry points, configuration, database bootstrap, initial schema, CI workflow, existing API tests, and the Phase 2 execution plan.

## Findings and actions

| Area | Finding | Action / disposition |
|---|---|---|
| CI | Latest branch CI runs passed at audit time. An earlier Phase 1 commit failed at TypeScript typecheck; a later commit and subsequent PR run passed. | Keep CI as a required gate; do not infer correctness from one green run. |
| Migrations | The original runner applied one hard-coded SQL file, recorded only its name, and had no checksum or concurrency lock. | Replace with ordered SQL discovery, SHA-256 checksums, per-migration transactions, and a PostgreSQL advisory lock. |
| Migration history | Existing legacy rows without checksums cannot be safely verified automatically. | Runner fails closed and requires a deliberate baseline step rather than silently trusting old history. |
| Tenant integrity | Department/process/opportunity relationships could point across tenants because foreign keys checked IDs but not tenant ownership. | Add composite tenant-aware foreign keys and supporting indexes in migration 002. |
| Authentication | No verified identity provider or authenticated-principal middleware exists yet. | Do not expose tenant CRUD endpoints until the identity contract and fail-closed authorization are implemented. |
| Database lifecycle | The health router owns a separate pool at module import time; shutdown currently closes only the HTTP server. | Track as a follow-up before production deployment; tests currently avoid readiness checks requiring a live database. |
| Configuration | .env loading relies on a process working-directory assumption, and the development database URL has a default. | Keep production configuration validation in the next hardening pass; never deploy with the development default. |
| CI reproducibility | CI uses --no-frozen-lockfile, allowing dependency resolution to drift. | Add a committed lockfile and switch CI to frozen installs before calling the build reproducible. |

## Immediate safety boundary
No production identity, n8n integration, LLM provider, external credentials, cloud deployment, or production data are configured. The dedicated Hostinger VM remains reserved for n8n and is not part of the CIAS application topology.

## Phase 2 acceptance criteria
- Migration checksums match on every run; applied migrations are immutable.
- Concurrent migration attempts serialize.
- Tenant-aware foreign keys reject cross-tenant relationships.
- Protected API routes fail closed without verified identity.
- Integration tests prove tenant A cannot read or mutate tenant B records.
- CI runs typecheck, tests, build, and database-backed integration tests.
