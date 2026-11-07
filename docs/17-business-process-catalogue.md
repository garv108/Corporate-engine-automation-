# Business Process Catalogue — implementation boundary

**Status:** Implemented catalogue and M1-A versioned process-model API foundation; process discovery sessions and process intelligence remain future work.

## Purpose

The business-process catalogue gives each tenant a structured, discoverable record of the business processes it performs. It is the identity and metadata layer from which later process modelling, event capture and process intelligence can be built.

A catalogue record is not, by itself, an executable workflow or a complete process model.

## Current record

The catalogue API stores:

- process identity: immutable record ID and tenant ID;
- descriptive metadata: name and optional description;
- organizational association: optional department ID;
- system context: a list of named systems;
- inputs and outputs: descriptive string lists;
- sensitivity: one of the initial vocabulary values below.

The department association means the process is associated with that department. It does not establish an accountable process owner, execution authority or reporting relationship. A future process-owner relation should reference a verified employee, team or service principal under explicit tenant policy.

## Initial sensitivity vocabulary

The API and database currently accept:

- `unknown` — not yet classified; downstream use must fail closed and treat it as restricted until a tenant-approved policy says otherwise;
- `public`;
- `internal`;
- `confidential`;
- `sensitive_workforce`;
- `restricted`.

This is the initial product vocabulary, not a claim that all tenants have identical legal or information-governance taxonomies. Tenant-specific classification policies and mapping are a future governance capability. Migration 004 intentionally refuses to silently rewrite non-standard existing values; operators must review and map them explicitly.

## M1-A process-model layer

The versioned process-model API is mounted beneath the catalogue resource at `/api/v1/business-processes/{processId}/models`. It supports draft creation, retrieval, whole-draft replacement, explicit fact review, confirmation and publication. Tenant identity is derived from the authenticated principal. The database enforces tenant/model-version relationships and blocks child inserts/updates after confirmation. A confirmed version can only be advanced to published; published model content cannot be updated.

A model graph supports start/end/activity/decision/event/handoff/subprocess steps and directed conditional/exception/parallel transitions. Participants are generic descriptors (person, role, team, system, external party or unknown), not mandatory HR records. Facts preserve provenance kind and review state; new facts start as `unreviewed`. Confirming a model marks unreviewed user statements as user-confirmed but does not silently verify AI hypotheses or imported observations.

The API has no model delete route. Data retention and erasure must be handled through a separately governed process. Publication is not workflow production approval.

## Explicitly outside this catalogue API

The following remain outside the current API:

- process owner and accountable role assignment;
- process cases/instances and event ingestion;
- cycle-time, waiting-time, throughput, rework or conformance analytics;
- executable workflow definitions, production approvals or n8n dispatch.

These capabilities must not be inferred from the current `systems`, `inputs` or `outputs` arrays.

## Intended evolution

The intended domain progression is:

1. **Catalogue:** stable process identity and descriptive metadata.
2. **Process model:** separately versioned steps, transitions, roles, rules, inputs/outputs and exception paths. Published versions are immutable; changes create a new version.
3. **Process cases and events:** an occurrence binds to an explicit model version and an event history with source provenance and event-time/ingestion-time distinction.
4. **Process intelligence:** metrics and bottleneck hypotheses are calculated from quality-qualified events, with coverage and limitations visible.
5. **Intervention governance:** automation is compared with process redesign, policy simplification, training, data remediation and capacity changes. Automation remains approval-gated.

The model notation (for example, BPMN-like notation or a state machine), case-correlation strategy, event retention and tenant-specific classification policy require separate architecture decisions before implementation.

## Catalogue invariants

- Every record belongs to exactly one tenant.
- Every query and mutation is scoped using the authenticated tenant principal.
- An associated department must belong to the same tenant.
- Create/update and their audit records commit or roll back together.
- Collection reads use bounded keyset pagination ordered by `name ASC, id ASC`.
- The catalogue does not grant process execution or workflow deployment authority.
