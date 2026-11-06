# Data & Knowledge
PostgreSQL is authoritative; pgvector supports semantic retrieval; PostgreSQL full-text supports lexical search; object storage holds source artifacts and exports; Redis is transient cache/queue only.

Domains: tenants/users/roles, departments, processes, opportunities, sources/findings, capabilities, templates, skills, agent tasks, workflow projects/versions, approvals, executions, metrics and audit events.

Lifecycle: ingest -> normalize -> classify -> verify -> deduplicate -> index -> retrieve -> cite -> freshness review -> archive.

Keep tenant business knowledge separate from public capability knowledge, task working state, procedural Skills and telemetry. Apply tenant filters before semantic ranking. Return source references and freshness.
