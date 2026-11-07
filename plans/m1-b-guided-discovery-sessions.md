# M1-B — Guided Discovery Sessions

**Status:** Implementation contract for the first M1-B backend slice  
**Milestone:** M1 — Work Mapping and Guided Discovery  
**Depends on:** M1-A versioned Process Models API

## 1. Objective

Persist an interruptible discovery conversation and its evolving structured work map. The system must remember what the user said, preserve the provenance of every structured fact, identify missing information deterministically and prevent confirmation until the minimum information gate is met.

The initial implementation is deliberately provider-neutral and deterministic. It does not claim to understand arbitrary free text or invent structured facts. A later model adapter may propose field mappings and hypotheses, but it must not bypass validation, provenance, completeness or human confirmation.

## 2. User journey

1. A user starts a session with a natural-language description of a recurring process or activity.
2. CIAS stores the description as the first user turn and asks the first high-value missing question.
3. The client submits each response as a user message plus explicit structured fact updates.
4. CIAS validates the fact paths and values, records append-only fact events, updates the materialized draft and recalculates completeness.
5. CIAS asks the next required question while required information remains missing.
6. When the minimum gate is satisfied, CIAS marks the session ready for review and lists optional information areas that could improve later analysis.
7. The user resumes the session when needed, reviews the facts and confirms the snapshot.
8. Confirmation locks the discovery session. It does not publish an official process model, change the organization's real process or authorize automation.

## 3. Deterministic minimum completeness gate

Required fields:

- **purpose:** why the process exists;
- **trigger:** what starts it;
- **expectedOutcome:** what should be true or delivered when it finishes;
- **steps:** at least one valid activity/decision/step represented using the M1-A process-step contract.

The step graph is validated against the M1-A processModelInputSchema, including unique step keys and valid transition endpoints. Invalid graph updates are rejected and do not alter the session revision or fact history.

Uncertainty is stored explicitly as one or more records with a field path, description and optional explanation of why it matters. The completeness response returns these open uncertainties without pretending they are resolved. They do not automatically block a review-ready state, but a user must explicitly acknowledge them when confirming the snapshot; the acknowledgement is audited. They can also be resolved by replacing the uncertainty list with an updated list.

Recommended, non-blocking detail areas:

- scope;
- systems and tools;
- inputs and outputs;
- rules and decisions;
- exceptions and rework;
- human judgement;
- volume and seasonality;
- handling/waiting time;
- current baseline;
- data handling;
- constraints.

Recommended areas remain visibly missing; they are not silently converted to empty/negative assertions. Later tenant policy may define additional requiredness by process type, but no industry-specific mandatory fields are hard-coded in this slice.

## 4. Persistence model

### process_discovery_sessions

Stores tenant, lifecycle state, original description, system-set data classification (unknown by default; not client-overridable in this slice), current structured draft, completeness result, next question ID, optimistic concurrency revision, schema version, creator and confirmation metadata.

### process_discovery_session_turns

Append-oriented ordered transcript with speaker, message, question ID, actor and timestamp. Turns are scoped to the same tenant and session.

### process_discovery_session_fact_events

Append-oriented fact history with field path, JSON value, provenance kind, review state, source turn, recorder and timestamp. A new answer marks the previous current fact for that field as superseded (is_current=false) and inserts a new event. History is retained.

The session's current_draft and completeness columns are materialized state for efficient resume and deterministic API responses. The fact-event history remains the audit trail for user-provided values.

## 5. Lifecycle and concurrency

Session states:

- **active:** one or more required facts are missing;
- **ready_for_review:** minimum gate satisfied; optional detail can still be added;
- **confirmed:** user explicitly reviewed and confirmed the snapshot; immutable;
- **abandoned:** reserved terminal state for a future explicit abandon operation.

Every turn supplies the revision returned by the latest GET/create/turn response. The repository locks the session row and compares the expected revision. A stale write returns HTTP 409 and the current revision. This prevents two browser tabs or concurrent requests from silently overwriting each other.

The database blocks writes to confirmed/abandoned sessions, turns and fact history. Confirmation is a separate permission and audit event. If the current draft contains open uncertainties, the confirmation command must include an explicit acknowledgement; otherwise it returns HTTP 409.

## 6. API contract

- GET /api/v1/process-discovery/sessions?limit=50&cursor=...
- POST /api/v1/process-discovery/sessions
- GET /api/v1/process-discovery/sessions/{sessionId}
- POST /api/v1/process-discovery/sessions/{sessionId}/turns
- POST /api/v1/process-discovery/sessions/{sessionId}/confirm

Turn payloads contain message, factUpdates, expectedRevision and an optional answerToQuestionId. Each fact update has an allowlisted fieldPath and typed value. The server assigns user_statement provenance; clients cannot submit tenant IDs, review states or provenance kinds. Session classification is system-set to unknown and is not client-overridable in this slice; downstream model/context policies must treat it as restricted until a tenant-approved classification policy says otherwise.

Permissions are separate: process_discovery_sessions:read, :create, :update and :confirm. Tenant identity always comes from the verified principal.

## 7. Security and governance

- Tenant-scoped queries on every read/write, composite tenant/session foreign keys and authenticated tenant context.
- Structured field-path allowlist; no arbitrary JSON path writes.
- Strict Zod validation and reuse of the M1-A process graph schema.
- No client-supplied provenance, reviewer, status or revision mutation.
- Transactional audit writes for creation, turns and confirmation.
- Optimistic concurrency and explicit lifecycle transitions.
- Original descriptions and messages may contain confidential information. Do not use real sensitive workforce, personal or regulated data until classification-aware read policy, retention and legal/privacy requirements are approved.
- No LLM context, external provider, workflow execution or secret access is introduced in this slice.

## 8. Acceptance tests

- A vague initial description creates a resumable session with the first missing question.
- The transcript and current structured draft survive a new GET/resume.
- Structured user answers are persisted with provenance and source-turn links.
- Required missing facts are reported; optional missing facts do not block review.
- A valid step graph with multiple transitions can satisfy the minimum gate.
- Open uncertainties remain visible in the completeness response and require explicit acknowledgement at confirmation.
- Invalid step/transition references fail before persistence and do not increment the revision.
- A stale revision is rejected with HTTP 409.
- Cross-tenant reads return not found and list results never cross tenants.
- Confirmation is blocked when the minimum gate is incomplete.
- Confirmation marks current user facts user-confirmed and freezes the session.
- Every state-changing operation writes an audit record in the same transaction.

## 9. Deliberately deferred

- LLM extraction and adaptive natural-language follow-up.
- Session-to-catalogue/process-model conversion.
- Visual process-map editor and browser UI integration.
- Model provider selection, credentials and live model calls.
- Workflow library, opportunity scoring, n8n integration and execution.
- Production data and deployment.

The next engineering slice after this foundation is a discovery UI connected to the session API. A provider-neutral AI interview adapter should be added only after the deterministic persistence path is verified and a model provider/data policy is selected.
