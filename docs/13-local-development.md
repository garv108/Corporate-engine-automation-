# Local Development

## Requirements
- Node.js 22 or newer
- pnpm 10 or newer
- Docker Desktop or Docker Engine with Compose

## Setup
1. Clone the repository and check out `feat/phase-2-tenant-api`.
2. Copy `.env.example` to the repository-root `.env`.
3. Install dependencies with `pnpm install`.
4. Start local PostgreSQL and Redis with `pnpm db:up`.
5. Apply ordered database migrations with `pnpm db:migrate`.
6. Verify tenant-boundary constraints with `pnpm --filter @cias/api db:verify-tenant-integrity`.
7. Start API and web applications with `pnpm dev`.

## Local endpoints
- Web: http://localhost:5173
- API: http://localhost:4000
- API liveness: http://localhost:4000/api/v1/health/live
- API readiness: http://localhost:4000/api/v1/health/ready
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Verification
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm db:migrate` (safe to re-run; applied migrations are checksum-verified)
- `pnpm --filter @cias/api db:verify-tenant-integrity`

## Database migration policy
- Add a new numbered SQL file under `database/` for every schema change.
- Never edit an already-applied migration; the runner verifies SHA-256 checksums.
- Migration execution is serialized with a PostgreSQL advisory lock.
- If an older database has migration records without checksums, the runner stops. Verify the schema and deliberately baseline its history; do not bypass the check by guessing a checksum.

## Notes
The Compose credentials are disposable local-development values. Never reuse them outside a developer workstation. The API readiness endpoint checks PostgreSQL; Redis and external agent/workflow services are not integrated yet.

Production deployment, identity-provider integration, n8n integration, and external AI-provider credentials are intentionally out of scope for this phase.
