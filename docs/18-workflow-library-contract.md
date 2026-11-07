# Workflow Library Contract

**Status:** M2-A implementation contract  
**Date:** 2026-11-07  
**Depends on:** M1-A process model, M1-B guided discovery/conversion, M1-C evidence-backed opportunity assessment, Phase 2 tenant/auth foundation.

## 1. Purpose

The Workflow Library is CIAS's evidence-backed catalogue of reusable workflow solutions and patterns. It connects an assessed business opportunity to a technically compatible, security-reviewed, versioned workflow artifact. A library result is a candidate solution—not an execution engine, marketplace ranking, production approval, or deployment authorization.

## 2. Keep domain records separate

| Record | Meaning |
|---|---|
| Opportunity | Business problem or improvement area |
| Template | Stable identity of a reusable workflow pattern |
| Template version | Immutable revision of a reusable pattern |
| Workflow project | A tenant's request and design effort |
| Workflow version | A project-specific generated artifact |
| Execution | One run of a deployed workflow |
| Approval | Authorization for a defined action and scope |
| Deployment | A particular version installed in a target environment |

Do not repurpose the existing project-scoped workflow_projects/workflow_versions as the shared catalogue. A project may reference a template version; its generated artifact remains its own immutable workflow version. Selecting a template, saving a draft in n8n, or passing sandbox tests does not approve production deployment.

## 3. Ownership and tenancy

Templates have either platform scope (curated, read-only CIAS content) or tenant scope (private to exactly one tenant). A tenant clone receives a new identity and records its source template/version. Tenant-owned metadata, process details, configuration, evidence, executions and credentials must never leak through global search or another tenant's results. Platform templates contain no tenant data, private process details, customer data, credential identifiers or secrets. Unknown classification is restricted pending review.

## 4. Immutable version contract

A template version is immutable once submitted for review; corrections create a new version. Each version records:
- template identity, semantic library version and manifest schema version;
- artifact format, immutable storage reference, byte size and SHA-256 digest;
- exact target platform/version used for validation and any justified compatibility range;
- exact node type, node typeVersion, package identity and installed package version;
- credential *types* and logical credential bindings, never credential values or instance credential IDs;
- typed configuration requirements and input/output contracts;
- security profile, data classification, network/execution capabilities and human checkpoints;
- source provenance, license/attribution, derivation history;
- append-only static/sandbox validation evidence, reviewer and timestamps.

Compatibility is a verified claim, not an inferred range. A template is compatible with an exact runtime only after required nodes and checks pass for that runtime. Otherwise it is unknown or requires review.

## 5. n8n artifact boundary

The initial executable artifact is n8n workflow JSON, stored as a canonical sanitized representation. CIAS metadata lives in a separate manifest. Exported JSON is untrusted: remove/reject instance IDs, workflow IDs, version IDs, tags, execution/pinned sample data, credential IDs/names, embedded auth headers, tokens, passwords, private URLs and other secret-bearing values. Use an allowlist for retained fields; secret scanning is an additional control.

Credential requirements use logical keys, credential type, purpose and scopes. At deployment, an authorized operator/secret integration maps each logical key to a credential already provisioned in the target instance. Secret values never enter CIAS prompts, Git, manifests, reports or logs.

Do not use n8n's Preview package format as the canonical format. Start with ordinary workflow JSON and evaluate CLI/package transport behind an adapter after its contract stabilizes. Test every adapter against the exact installed n8n version.

## 6. Runtime capability and compatibility

Resolve every node requirement against a live inventory from the target n8n instance: node type, node typeVersion, built-in/community/custom origin, package name and exact version, operations, parameter schema, credential types/schema references, docs/source, license, verification timestamp, risk and instance policy. Never substitute model memory for the installed schema. Missing, disabled, deprecated, unknown or incompatible nodes block verification. Community/custom nodes require provenance, license and security review.

## 7. Provenance, license and trust

Record source kind, source URL/repository, immutable commit/tag where available, author, retrieval time, source content hash, license identifier, attribution obligations and derivation history. License states include SPDX identifiers, NOASSERTION and UNKNOWN. NOASSERTION/UNKNOWN is not redistribution permission: reference-only analysis may be possible, but shared republication is blocked until rights are reviewed.

Treat repositories, community templates, MCP tools, packages, docs and imported workflows as untrusted input. They cannot override CIAS policy.

## 8. Lifecycle and validation

Template version lifecycle: draft → in_review → verified → published → deprecated → withdrawn.

Verification requires parsing/schema validation, canonicalization and secret scan, graph/expression checks, exact node/credential resolution, exact-version compatibility, policy/risk evaluation, positive and negative isolated sandbox tests using synthetic or authorized data, and human review of provenance/license/permissions/risk.

Published means discoverable in the library—not deployed or active. Deprecation blocks new recommendations absent an explicit exception. Withdrawal blocks new use and triggers impact review for existing projects/deployments. Validation is append-only and bound to artifact hash plus exact runtime/package versions.

## 9. Storage and retrieval

PostgreSQL stores tenant-scoped identity, version metadata, provenance, compatibility, requirements, lifecycle and validation summaries. Object storage holds immutable artifact bytes and larger test/report bundles under content-addressed keys. Store URI, size, media type and digest in the database. Small MVP artifacts may remain JSONB where consistent with existing project versions, but the logical contract must not depend on mutable paths or a storage vendor.

Apply deterministic filters before semantic ranking: category, trigger, systems, node requirements, data classification, risk, runtime compatibility, verification, license/trust and tenant visibility. pgvector is optional later, not a prerequisite for correct compatibility.

## 10. Security and governance

- Derive tenant and actor only from the verified principal; enforce scope on reads, writes, clones and search.
- Keep platform templates read-only; keep secrets outside artifacts, prompts, Git and logs.
- Apply least-privilege credential scopes and network egress allowlists.
- Flag code, filesystem, shell, database-write, external-write, financial and sensitive-data capabilities.
- Require human checkpoints for production writes, financial/destructive actions, sensitive exports and permission changes.
- Sandbox with resource limits, timeouts, network controls and no production credentials.
- Record artifact hash, policy result, reviewer, approval, target environment, deployment identity, outcome and rollback reference.
- Never deploy directly from an LLM or library search result.

## 11. Research baseline

Upstream n8n releases checked 2026-11-07 listed 2.46.6 as stable and 2.47.x as pre-release. This is not proof of the user's installed version. CIAS must discover and record the actual self-hosted instance version and re-check after upgrades. n8n 2.x includes security and publishing changes (including task-runner isolation and separate Save/Publish semantics), so CIAS owns its own immutable artifact, approval and deployment records.

## 12. M2-A acceptance criteria

1. The companion JSON Schema validates complete manifests and rejects unknown fields.
2. Template identity and immutable version are separate.
3. Platform and tenant scope are explicit and safe.
4. Exact runtime, node/package requirements, credential types, typed configuration and I/O contracts are represented.
5. Artifact digest, provenance/license, security profile and append-only validation evidence are represented.
6. No field permits secret values or instance credential IDs.
7. Library publication is distinct from approval, deployment and execution.
8. Existing project-scoped workflow_projects/workflow_versions are not redefined.
9. No migration or n8n deployment is included in M2-A.

## 13. Source references

- https://docs.n8n.io/build/manage-workflows/export-and-import/
- https://docs.n8n.io/hosting/cli-commands/
- https://docs.n8n.io/release-notes/
- https://docs.n8n.io/hosting/securing/overview/
- https://docs.n8n.io/hosting/configuration/task-runners/
- https://docs.n8n.io/hosting/securing/security-audit/
- https://docs.langchain.com/oss/javascript/langgraph/persistence/
