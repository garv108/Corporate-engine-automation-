# Local Development

## Requirements
- Node.js 22 or newer
- pnpm 10 or newer
- Docker Desktop or Docker Engine with Compose

## Setup
1. Clone the repository and check out `feat/phase-1-foundation`.
2. Copy `.env.example` to `.env`.
3. Install dependencies with `pnpm install`.
4. Start local infrastructure with `pnpm db:up`.
5. Apply the initial database schema with `pnpm db:migrate`.
6. Start API and web applications with `pnpm dev`.

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

## Notes
The Compose credentials are disposable local-development values. Never reuse them outside a developer workstation. The API readiness endpoint checks PostgreSQL; Redis and external agent/workflow services are not integrated yet.

The initial SQL file is a bootstrap schema, not a production migration system. Before production use, introduce ordered, immutable migrations and a migration ledger.
