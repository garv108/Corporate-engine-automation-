# Workflow Intelligence & Assembly
## Pipeline
1. Intent/risk classification.
2. Requirement extraction.
3. Ask only blocking clarification questions.
4. Discover processes, systems and integrations.
5. Search capability registry and templates.
6. Design graph, mappings, branches, retries and error paths.
7. Bind exact node IDs, versions and parameter schemas.
8. Generate workflow JSON and separate configuration manifest.
9. Static validation and secret scan.
10. Sandbox tests with synthetic or authorized test data.
11. Human review and approval.
12. Controlled deployment, monitoring and optimization.

## Required requirements
Trigger, actors, systems, inputs/outputs, business rules, volume, schedule, exceptions, data sensitivity, retention, SLA, idempotency, approval and success metrics.

## Artifact bundle
Workflow JSON; target n8n version; node inventory; credential references (never secrets); environment variables; input/output contracts; test fixtures; validation report; setup guide; rollback/export reference; provenance.

## Gates
Schema, node/version, required parameters, graph connectivity, expression references, credential references, secret scanning, static policy, sandbox positive/negative tests and human approval.

Never fabricate node parameters, credentials, API behavior or successful test results. Never deploy directly from an LLM.
