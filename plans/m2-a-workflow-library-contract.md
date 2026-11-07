# M2-A — Workflow Library Contract

**Status:** Contract implementation  
**Branch:** feat/m2-workflow-library-contract  
**Base:** feat/phase-2-departments-api at 0abd22ffa55eb1df85b05e6c4ba27339c40f4d6c  
**Date:** 2026-11-07

## Objective
Establish the canonical, versioned, tenant-safe contract for reusable workflow templates before persistence, capability synchronization or generation.

## Deliverables
- docs/18-workflow-library-contract.md — domain boundaries, tenancy, artifact format, provenance, validation, storage, lifecycle and governance.
- schemas/workflow-library-entry.schema.json — strict machine-readable manifest schema.

## Non-goals
No SQL migrations/API endpoints, n8n connection or deployment, credential access, workflow generation/execution, production approval integration, or commitment to the Preview package format. The installed self-hosted n8n version is not yet verified.

## Acceptance criteria
1. Schema validates required metadata and rejects unknown fields.
2. Template identity and immutable version are separate.
3. Platform/tenant visibility is explicit.
4. Exact n8n version and node/package compatibility are represented.
5. Credential requirements use logical references, never secret values or instance credential IDs.
6. Artifact hash, provenance/license, security profile and append-only validation evidence are represented.
7. Publication is distinct from approval, deployment and execution.
8. Existing project-scoped workflow_projects/workflow_versions are not overloaded.
9. No migration is added before the contract is reviewed.
10. Existing PostgreSQL-backed CI remains green.

## Follow-on sequence
- **M2-B Runtime capability inventory:** read-only connection to self-hosted n8n; discover exact version, installed nodes/packages/operations/schemas/credential types and instance policy.
- **M2-C Library persistence/search:** tenant-safe template/version tables, immutable artifact storage, validation records and deterministic compatibility filters.
- **M2-D Request specification:** translate opportunity/request into typed requirements; ask only blocking clarifications; resolve exact available capabilities.
- **M2-E Draft assembly/static validation:** generate sanitized n8n JSON plus separate configuration manifest; validate graph, schemas, node versions, expressions, credentials, secrets and policy.
- **M2-F Sandbox verification:** positive/negative fixtures with synthetic or authorized data; capture output, cost, logs and artifact hash; no production credentials.
- **M2-G Approval/deployment adapter:** human approval, target-specific credential binding, controlled publish/deploy, versioned rollback and execution audit.

## Definition of done
The contract and schema agree; examples validate; security and tenancy boundaries are explicit; source references are current; migrations/API can be derived without inventing semantics.
