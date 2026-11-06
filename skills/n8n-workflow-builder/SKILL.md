---
name: n8n-workflow-builder
description: Generate n8n workflow drafts using exact installed node schemas, compatible versions and reviewed templates.
---
# n8n Workflow Builder
1. Read approved workflow specification.
2. Query registry for exact node IDs, installed versions, operations, parameter schemas and credential types.
3. Retrieve templates and verify provenance/license.
4. Design graph, mappings, branching, retries, idempotency and error paths.
5. Generate JSON only from supported schemas.
6. Generate separate config manifest with credential references, never secrets.
7. Run static validation.
Return workflow JSON, target version, node inventory, manifest, assumptions and warnings. Never fabricate parameters or deploy.
