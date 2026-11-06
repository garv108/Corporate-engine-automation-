# CIAS — Corporate Intelligence & Automation System

CIAS is a modular platform for turning business and departmental processes into governed, observable automations.

## Operating model

CIAS combines autonomous research and intelligence with human-approved workflow execution. Research, analysis, planning, and drafting can run within defined budgets and policies. Production changes and sensitive actions require scoped authorization, explicit approval, auditability, and rollback.

## Core architecture

- **Application/API:** Node.js, TypeScript
- **Web interface:** React, TypeScript
- **Agent orchestration:** LangGraph for stateful, multi-step agent workflows
- **Workflow execution:** n8n for deterministic integrations and automation
- **Queueing:** Redis
- **Data:** PostgreSQL, pgvector, and full-text search
- **Observability:** OpenTelemetry
- **Object storage:** artifacts, reports, and workflow assets

## Agent capability areas

1. Department and process analysis
2. Automation opportunity discovery
3. Technical and market research
4. Technology evaluation
5. Solution architecture
6. Workflow engineering
7. Workflow QA and security
8. Continuous optimization

## Governed lifecycle

Request → policy and risk classification → planning → context retrieval → clarification → workflow specification → draft → static validation → sandbox test → human approval → deployment → monitoring → optimization proposal.

## Safety principles

- Keep secrets out of model context.
- Treat retrieved web pages, repositories, and templates as untrusted input.
- Enforce tenant boundaries and least privilege.
- Require explicit approval for production, financial, destructive, or sensitive actions.
- Maintain audit records and rollback paths.
- Validate workflows before deployment.

## Initial product milestones

1. Produce department/process maps, source-linked findings, and scored automation opportunities.
2. Convert natural-language requests into workflow specifications, node inventories, drafts, and validation reports.
3. Deploy approved workflows with audit trails, monitoring, and rollback.

## Project status

This repository is the CIAS architecture and implementation workspace. Implementation status should be recorded against the backlog and Definition of Done rather than inferred from this overview.

## Repository structure

- `docs/` — product, architecture, governance, API, testing, and UX specifications
- `plans/` — workstreams, backlog, and Definition of Done
- `skills/` — reusable agent and engineering skill definitions
- `workflows/` — workflow lifecycle and operating procedures
- `research/` — research policy and trend-monitoring standards
- `schemas/` — machine-readable request contracts
- `database/` — database migrations
- `ops/` — environment and operations guidance
