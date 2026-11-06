# System Architecture
## Style
Modular platform with control, intelligence, execution and knowledge planes. Start with a modular Node.js API plus separately deployed n8n and agent workers; split services only when scale or isolation requires it.

## Components
- Frontend: React + TypeScript dashboard, command center, research hub, opportunity explorer, workflow studio and approvals.
- API: Node.js + TypeScript; authentication, authorization, tenant scope, request lifecycle, policies, approvals and audit.
- n8n: schedules, webhooks, integrations, retries and deterministic operational workflows.
- LangGraph: stateful multi-step agent planning, conditional reasoning, resumable tasks and human checkpoints.
- Redis/queue: background dispatch, concurrency and locks.
- Agents: department analysis, opportunity discovery, research, technology evaluation, solution architecture, workflow generation, QA/security and optimization.
- Capability registry: versioned n8n nodes, schemas, credentials, APIs, MCP tools, Skills and templates.
- Knowledge: PostgreSQL, pgvector, full-text search and object storage.
- Execution: isolated sandbox, versioned exports, approval-gated deployment and rollback.
- Observability: OpenTelemetry traces, structured logs, metrics and alerts.

## Request flow
Request -> auth/policy -> intent/risk classification -> plan -> retrieve tenant context and exact capabilities -> clarify blockers -> workflow spec -> draft -> static validation -> sandbox -> approval -> deploy -> monitor -> optimization proposal.

## Constraints
Tenant ID on tenant-owned records. Secrets are never passed to model context. Retrieved content is untrusted. Generated workflows bind to target n8n version. Production writes are permission checked and audited.
