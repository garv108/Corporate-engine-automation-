# M1-A — Generic Work Map Domain Contract

**Status:** Proposed implementation contract; design review required before schema migration  
**Milestone:** M1 — Work Mapping and Guided Discovery  
**Baseline:** CIAS Phase 0 Documentation Package v0.1.0; repository work-mapping plan

## 1. Purpose

Define the smallest durable, industry-neutral model that can represent how work is currently performed. The model must support a user-confirmed process map now and serve as the stable input contract for guided discovery, opportunity assessment, workflow recommendations and later process analytics.

This is a domain contract, not a commitment to implement every enterprise domain in one milestone.

## 2. Product intent preserved

CIAS remains an organizational intelligence and operating layer with four connected responsibilities:

1. **Understand** organizational context and how work happens.
2. **Coordinate** objectives, actors, tasks, dependencies and resources.
3. **Execute** approved activities through governed integrations.
4. **Improve** outcomes using traceable evidence.

The initial demonstration concentrates on understanding one real process and preparing a defensible improvement path. It does not narrow the long-term product to an automation-only tool.

## 3. Scope of M1-A

### In scope

- Reuse the existing tenant-scoped `business_processes` record as the stable process identity.
- Add versioned process models with explicit draft, user-confirmed and published lifecycle states.
- Represent a process as activities connected by directed transitions; do not assume a simple linear list.
- Capture each activity's purpose, participant, systems/tools, inputs, outputs, rules/decisions, exception paths and human judgement.
- Keep participant types industry-neutral: person, role, team, system, external party or unknown.
- Preserve field-level provenance so observed facts, user statements, imported evidence, synthetic examples and AI hypotheses cannot be silently conflated.
- Enforce tenant scope, auditability, schema versioning and immutable confirmed/published snapshots.

### Explicitly out of scope

- Conversational interview/session persistence and LLM follow-up logic (M1-B).
- Process-case/event ingestion and operational process mining.
- Opportunity scoring or business-case calculations (M1-C).
- Workflow library ingestion, n8n workflow generation or execution.
- Workforce lifecycle, objectives, KPI, task scheduler and performance-review modules.
- BPMN editing/import/export in this first data-model slice.
- Production data, production credentials or deployment.

## 4. Canonical domain concepts

| Concept | Responsibility | Important distinction |
|---|---|---|
| Business process | Stable identity, name, description, tenant and catalogue metadata | Already exists as `business_processes`; not a complete model |
| Process model version | One structured definition of the process at a point in time | A process identity can have many versions |
| Process step/activity | A unit of work, decision, event, hand-off, subprocess, start or end | Not an individual execution |
| Transition | A directed path between steps, optionally with a condition/label | Defines flow; display order is not process semantics |
| Participant | Person, role, team, system, external party or unknown actor involved in a step | Not limited to employees or departments |
| Resource descriptor | Tool, application, device, facility, budget or other resource used by a step | Describes a dependency; does not grant access |
| Process fact | A structured assertion about the process/model/step | Must carry provenance and review state |
| Evidence reference | Source or artifact supporting a fact | Evidence is not automatically proof of causality |
| Process case | One occurrence of a process | Deferred; never confuse it with the process definition |

## 5. Version and confirmation semantics

- A model version starts as **draft** and may be edited while draft.
- **Confirming** means an authorized user has reviewed the map as an accurate representation to the best of their knowledge at that time. It does not mean the process is formally approved as policy or that automation is authorized.
- A confirmed version is immutable. Corrections create a new draft version; history is preserved.
- **Publishing** is a separate, optional process-owner/governance action. It identifies the version adopted as the organization's reference process.
- Superseding or archiving a version never rewrites historical cases or evidence.
- Every snapshot carries a model schema version and a deterministic content digest.

The API must reject edits to confirmed/published versions. Approval to model a process is not approval to change the real process or execute an automation.

## 6. Provenance and fact integrity

Every material fact must preserve at least:

- the model version and, when applicable, the step it describes;
- a stable field key/path and typed value;
- provenance kind: user statement, direct observation, approved system record, external document, AI hypothesis, synthetic fixture or derived calculation;
- review state: unreviewed, user-confirmed, verified, disputed or rejected;
- source/evidence reference where available;
- actor/system that recorded it and timestamp.

Rules:

1. AI hypotheses default to unreviewed; model confidence is not verification.
2. A missing answer remains unknown. It must not be filled with an invented default.
3. Multiple sources may support or contradict one fact; retain both rather than overwriting the history.
4. User edits and confirmations are attributable.
5. Synthetic records remain explicitly labeled and cannot support real-world ROI claims.

The exact evidence storage schema is an implementation detail, but provenance cannot be reduced to one untyped free-text note on the process.

## 7. Proposed persistence shape

This is the target relational shape for the implementation ADR and migration review:

- `business_processes`: existing stable catalogue identity; retain existing API compatibility.
- `business_process_model_versions`: tenant, process ID, version number, lifecycle state, purpose, scope, trigger, expected outcome, schema version, digest and confirmation/publication metadata.
- `business_process_model_steps`: tenant, model-version ID, stable step key, step kind, label, description, generic participant descriptor, inputs/outputs, rules, exceptions, human-judgement notes and optional layout metadata.
- `business_process_model_transitions`: tenant, model-version ID, source step, target step, transition label/type and optional condition.
- `business_process_model_facts`: tenant, model-version ID, optional step ID, field key, typed value, provenance kind, review state, source reference and recording metadata.
- `business_process_model_evidence` (or an equivalent shared evidence record): tenant, source kind, source label/reference, hash/version where available, observed/retrieved time and classification.

Use composite foreign keys so a step, transition, fact and evidence reference cannot cross tenants or model versions. Query scoping must still be enforced by the authenticated tenant principal; composite foreign keys do not prevent cross-tenant reads.

Use relational columns for identity, lifecycle, tenant ownership and relationships. Use JSONB only for versioned, validated attributes whose shape legitimately varies (for example, structured input/output contracts or condition expressions). Every JSONB payload must have a declared schema version and Zod validation at the API boundary.

Do not introduce a universal polymorphic `entity_type/entity_id` relation for core relationships. Keep typed foreign keys where the target is known.

## 8. API contract direction

Keep the current catalogue endpoints intact. Add domain commands/queries around model versions rather than exposing table CRUD:

- Create a draft model version for a catalogue process.
- Retrieve a model version with its steps, transitions, facts and evidence.
- Update a draft model as one validated aggregate.
- Confirm a draft model after explicit user review.
- Publish a confirmed version only when the relevant authority is available.

Every command derives tenant identity from the authenticated principal, validates associated records, writes its audit event in the same transaction and returns a stable resource representation. Long-running AI discovery is not part of these routes.

Exact route names and payload schemas are to be finalized in the API contract before implementation.

## 9. Validation invariants and acceptance tests

M1-A is accepted only when:

1. A tenant can create, retrieve and update a draft model associated with an existing catalogue process.
2. A model supports branching paths and multiple activities; the representation is not limited to a sequence number.
3. Activities can reference generic participant kinds without requiring an employee, department or HRMS record.
4. Inputs, outputs, systems/tools, rules, exceptions and human judgement can be represented and round-tripped.
5. Facts distinguish user statements, observed/imported evidence, AI hypotheses and synthetic fixtures.
6. AI hypotheses cannot become verified/confirmed facts without an explicit authorized review action.
7. Confirmed/published snapshots cannot be modified in place; edits produce a new version.
8. Cross-tenant and cross-version references are rejected by the database and API.
9. Unauthorized reads/writes fail; tenant identity is never taken from request body/header.
10. Create/update/confirm/publish operations have transactional audit records.
11. Existing catalogue API behavior and pagination remain unchanged.
12. Migration application and idempotency, TypeScript, unit/integration tests and production build pass in CI.

## 10. Technology decisions for this slice

- **PostgreSQL:** source of truth for process identity, model versions, steps, transitions, provenance and audit.
- **Express + TypeScript:** domain commands and tenant enforcement remain server-side.
- **Zod:** validate API input and flexible JSON contracts.
- **React + TypeScript:** retain the existing web stack; no UI framework rewrite.
- **No new agent framework in M1-A:** deterministic persistence and validation come first.
- **No vector dependency for the work map:** structured filtering and PostgreSQL full-text search are sufficient until retrieval evaluation proves otherwise.
- **n8n:** remains an execution adapter for later milestones, not the process-definition store or interview engine.

## 11. Process notation and visual tooling

The canonical model should be a structured graph, not a BPMN-only database representation.

- Keep a path to **BPMN 2.0** import/export for interoperability with process-modeling tools.
- Evaluate **bpmn-js** when standards-based BPMN editing/viewing becomes a requirement.
- Evaluate **React Flow (`@xyflow/react`)** for the first custom work-map canvas if a flexible, product-specific visualization is needed.
- Neither diagram library is the source of truth. The persisted domain graph remains authoritative; diagram layout is presentation metadata.
- Do not add either library to the dependency tree until the first UI story requires it.

## 12. Deferred tool evaluation

For M1-B, evaluate **LangGraph.js** for interruptible, resumable discovery because its checkpointer model supports thread state, human review and resumption. Do not adopt it until a vertical-slice prototype demonstrates that it materially simplifies persistence/recovery compared with a small state machine backed by PostgreSQL.

n8n remains separate from conversational orchestration. Do not make a workflow execution engine responsible for maintaining discovery conversation state.

## 13. Immediate implementation sequence

1. Ratify this domain contract and record any material deviations as an ADR.
2. Define SQL constraints, indexes and version state transitions for the proposed tables.
3. Implement migration and repository/domain layer without changing the existing catalogue contract.
4. Add tenant-scoped REST endpoints and transactional audit writes.
5. Add unit and PostgreSQL integration tests, including negative tenant/version cases and immutability.
6. Verify the existing test/build pipeline and review the migration sequence before merge.
7. Only then begin M1-B discovery-session persistence and interview logic.

## 14. Known repository dependency

The existing branch has migrations through `005_opportunity_lifecycle.sql`. New M1-A migrations must use the next unique migration number and must not collide with any open branch. The open OIDC PR currently introduces a conflicting `004_tenant_memberships.sql` on an older, diverged base; resolve that branch separately before any authentication merge. This design PR does not modify that OIDC branch.

The Phase 0 v0.1.0 package is currently held as the canonical reference outside this repository. Before treating the repository as the complete engineering source of truth, mirror the approved package into version control without rewriting its historical contents.

## 15. References

- CIAS Phase 0 Documentation Package v0.1.0: Product Charter, System Architecture, Enterprise Domain Model, Process Intelligence, Enterprise Governance, Enterprise Pilot and Decisions/Risks.
- Existing repository: `docs/17-business-process-catalogue.md`, `docs/17-first-milestone-work-mapping.md`, `docs/08-api-contracts.md`.
- OMG BPMN 2.0.2: https://www.omg.org/spec/BPMN/2.0.2
- bpmn-js: https://bpmn.io/toolkit/bpmn-js/
- React Flow: https://reactflow.dev/
- LangGraph.js persistence: https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/persistence.md
- LangGraph.js human-in-the-loop: https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/agents/human-in-the-loop.md
