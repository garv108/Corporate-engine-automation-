# First Milestone — Work Mapping and Guided Discovery

**Status:** Implementation plan proposed for the internal CIAS pilot  
**Scope:** One organization first; industry-neutral domain foundations  
**Purpose:** Define the first measurable product outcome without narrowing the long-term product model.

## 1. Product objective

Build an internal work-intelligence tool that can turn a natural-language description of work into a confirmed, evidence-linked map of how that work is currently performed. CIAS then identifies improvement options, searches a curated workflow library, and recommends a suitable implementation with explicit human checkpoints.

The first milestone is not a universal autonomous automation platform. It is a reliable process-discovery and recommendation tool used by the current organization, with data contracts that can later support additional organizations and industries.

## 2. First end-to-end user journey

1. A user describes a manual procedure, desired outcome or recurring task in natural language.
2. CIAS creates a discovery session and extracts an initial draft without assuming the description is complete.
3. A guided interview asks focused questions about missing or ambiguous facts. Follow-up questions may drill into prior answers.
4. CIAS maintains a structured draft and records which facts came from a person, an approved system, a document or an AI inference.
5. The interview has an explicit completeness gate. CIAS explains what remains unknown and why it matters; it must not invent missing facts.
6. The user reviews, edits and confirms the current-state work map. A separate explicit conversion action creates a catalogue process record and draft process-model version; it does not publish the process.
7. CIAS identifies evidence-backed candidate interventions. M1-C stores source-linked evidence, compares automation with process redesign, removal of unnecessary work, policy/approval simplification, training, capacity changes and data-quality fixes, and records versioned assessments using a deterministic rubric.
8. CIAS searches the initial curated workflow library and ranks relevant patterns/assets against the confirmed requirements.
9. The recommendation explains fit, compatibility, dependencies, permissions, credentials, licensing/cost, limitations, verification evidence and human intervention points.
10. Where a suitable asset exists, CIAS prepares a draft configuration/workflow project. An n8n JSON artifact is not treated as production-ready merely because it was generated.
11. The workflow is statically checked, sandbox-tested with synthetic or approved test data, reviewed and explicitly approved before any production execution.
12. CIAS records a baseline and later compares observed results with the original business case.

## 3. What a useful work map must capture

The interview should adapt to the process rather than forcing every industry into one fixed questionnaire. The following are core concepts; applicability and requiredness depend on the process.

| Area | Information to discover |
|---|---|
| Purpose | Process name, objective, desired outcome, owner and scope |
| Trigger | What starts the work; event, request, schedule or condition |
| Actors | Human roles, teams, external parties and systems involved |
| Steps | Ordered activities, responsible actor/system, decisions and hand-offs |
| Inputs | Data, documents, events, physical items or resources needed |
| Outputs | Deliverables, system updates, decisions or customer outcomes |
| Tools | Applications, devices, SaaS products, databases, APIs and spreadsheets |
| Volume | Frequency, case volume, seasonality and peak periods |
| Time | Active handling time, waiting time, cycle time and backlog where measurable |
| Rules | Business rules, thresholds, eligibility, approvals and policy constraints |
| Exceptions | Missing data, rejected cases, rework, retries, fallbacks and escalation |
| Human judgement | Decisions that require context, discretion, accountability or approval |
| Data | Sensitivity, source, destination, retention and permitted data movement |
| Baseline | Current effort, error/rework, throughput, delay, service quality and measurement period |
| Constraints | Budget, systems, licence, integration, security, legal and operational limits |

The map must distinguish observed facts, user statements, imported evidence, AI hypotheses and unresolved questions. An AI-generated hypothesis must never silently become an established process fact.

## 4. Generic work ontology — avoid corporate-only assumptions

CIAS should model work using reusable concepts:

- **Organization:** the legal or operational entity using CIAS.
- **Organizational unit:** a configurable grouping such as department, team, branch, location, studio, clinic, site or business function.
- **Actor:** a person, role, team, external party or system participating in work.
- **Process:** a repeatable set of activities intended to achieve an outcome.
- **Process version:** an immutable definition of the process at a point in time.
- **Activity/step:** a defined unit of work within a process.
- **Work item/case:** one real occurrence moving through the process.
- **Resource:** a tool, application, device, facility, budget or other resource used by work.
- **Rule/decision:** a condition or judgement that changes the path or outcome.
- **Evidence/observation:** a source-backed fact, measurement or assertion about work.
- **Workflow asset:** a reusable pattern, template, package, repository or implementation that can perform part of the work.
- **Execution:** a specific attempt to run an approved workflow version.

Do not equate a process definition with an individual task execution. Do not require every organization to have departments or employees. For example, a gym may use branches, trainers, members, class schedules, equipment, membership renewals, cleaning routines and maintenance tasks. These should map to the same generic concepts without forcing them into HR-specific fields.

Use a small stable core plus typed extension attributes and configurable category vocabularies. Do not create one table or one hard-coded enum for every industry. Industry-specific packs can be added later, with explicit ownership and schema versions.

## 5. Automation Opportunity is not a Workflow

Keep these concepts separate:

- **Opportunity:** a justified possibility to improve an existing process or activity.
- **Intervention candidate:** one option for addressing the opportunity, such as automation, redesign, policy change, training or capacity change.
- **Workflow asset:** a reusable solution design or implementation.
- **Workflow project:** the tenant-specific effort to configure and test a selected asset.
- **Workflow version:** an immutable implementation artifact with an exact content hash and dependency set.
- **Execution:** an authorized run of an approved workflow version.
- **Outcome:** measured change against an explicit baseline.

One opportunity may have several intervention candidates and several workflow alternatives. An opportunity can be approved for design without any workflow being approved for production. Testing a workflow does not grant it production authority.

Opportunity scores must be produced by a documented, versioned assessment using explicit dimensions and evidence. Do not accept unexplained client-supplied scores or represent a model's numeric output as verified confidence.

## 6. Workflow Library — target record

The library should support more than executable JSON. Asset types include process blueprints, automation patterns, workflow templates, importable packages, repositories, integration recipes and human-plus-automation playbooks.

Each asset should eventually describe:

- identity, title, purpose, category, tags and process/activity fit;
- source, publisher/owner, canonical URL, retrieval time, source version and provenance;
- artifact type, storage reference, content hash and immutable version;
- compatible platform and version range;
- required connectors, nodes, packages, APIs and external services;
- credential types and minimum permission scopes (never secret values);
- input/output contracts, triggers, dependencies and data classifications;
- paid plans, usage charges, licences and available alternatives;
- known limitations, failure modes, exception paths and maintenance status;
- authorship mode (human, AI-generated, AI-assisted, vendor/community/internal);
- operating mode (deterministic, AI-assisted, agentic/AI-driven, hybrid);
- verification level, environment, exact tested versions, test evidence and review date;
- human input, review, decision and approval points.

Authorship mode, operating mode and verification level are independent classifications. For example, AI may generate a deterministic workflow, and a human may author an AI-powered workflow.

Store structured metadata and relationships in PostgreSQL. Store binary/export artifacts in controlled object storage when configured. Keep source repository links and content hashes; copy or redistribute external artifacts only when their licence and terms permit it. A source URL is not proof that the content is safe, licensed for redistribution or still current.

## 7. Discovery and research ingestion

Start with curated, user-approved sources and manual workflow imports. Then add source connectors and scheduled discovery. Do not begin with an unrestricted crawler.

An ingestion pipeline should:
1. collect from allowlisted sources under their access terms;
2. preserve canonical source URL, publisher, retrieval time and content hash;
3. normalize metadata and extract supported artifact/document types;
4. detect duplicates and related versions;
5. inspect downloaded content for secrets, unsafe code and unsupported dependencies;
6. record licensing and redistribution constraints;
7. classify source trust and verification state;
8. place new or changed assets into a review queue;
9. publish only after required checks;
10. revisit assets for deprecation, compatibility and freshness.

Search results, repositories, files and templates are untrusted input. They may contain malicious instructions, unsafe code, leaked credentials or misleading claims. Never execute or import an unreviewed artifact into a production n8n instance.

## 8. Recommendation and workflow assembly

Recommendation should combine:
- structured requirement matching;
- platform and version compatibility;
- available connectors and capabilities;
- data classification and permission constraints;
- licence and total-cost fit;
- verification evidence and freshness;
- expected configuration effort;
- human intervention requirements;
- operational risk and reversibility.

AI may interpret requests, ask follow-up questions, summarize sources and explain ranked alternatives. Deterministic checks must reject incompatible, disallowed or unverified assumptions. The user should see why an asset was recommended, what is missing and what cannot be automated.

Workflow composition requires explicit input/output contracts, dependency ordering, error handling, idempotency, retry policy, compensation/reconciliation and human checkpoints. A collection of small workflows is not automatically a safe end-to-end process.

## 9. Architecture and technology decisions for the first milestone

| Concern | Initial decision | Why / guardrail |
|---|---|---|
| Web app | Keep React + TypeScript + Vite | Already in the repository; appropriate for an internal web tool and reusable UI |
| Backend | Keep Node.js + TypeScript + Express REST API | Centralizes authorization, validation, tenant scope, audit and business rules; reusable by future desktop/mobile clients and integrations |
| Database | PostgreSQL | Relational integrity for processes, opportunities, evidence, workflow versions and audit; use JSONB only for versioned flexible payloads |
| Workflow execution | n8n 2.x as first execution adapter | Existing self-hosted investment and workflow JSON portability; CIAS remains the policy/approval authority |
| Conversational reasoning | Provider-neutral model adapter; evaluate LangGraph JS for persisted, interruptible discovery | Human answers and follow-up loops need resumable state; keep orchestration separate from n8n execution |
| Process diagram | Start with structured step/flow data; assess BPMN 2.0 and bpmn-js when visual process editing is needed | Do not force BPMN into every simple task map; preserve a path to interoperable process diagrams |
| Search | PostgreSQL structured filters and full-text first; add embeddings/pgvector only when measured retrieval quality justifies it | Avoid adding vector infrastructure without a retrieval problem |
| Files | Abstract object storage behind a storage interface | Local development can use a compatible backend; production storage and retention are deployment decisions |
| Queue/cache | Add only when asynchronous ingestion and background processing require it | Redis is not required merely because it appears in a proposed stack |
| Observability | Structured logs, correlation IDs and usage/cost records from the start; OpenTelemetry as integrations grow | Enables debugging and future unit economics |

The existing React/Express/PostgreSQL direction is suitable for the first milestone and does not need a rewrite. Do not adopt GraphQL, microservices, Kubernetes, a separate workflow engine or a complex agent framework without a demonstrated requirement.

A REST API is the server-side contract used by the web app and other clients. It is not necessarily a paid third-party API. It keeps database access, authorization, validation and audit on the server. The web browser must not connect directly to PostgreSQL or hold integration credentials.

## 10. APIs and module boundaries

Use REST endpoints as stable contracts between the web client and the backend. Domain modules should own their own commands and queries. Avoid exposing database table operations directly as public APIs.

The first implementation sequence should be:

1. **Work/process map contracts:** process, process version, step/activity, actor/role, system/tool, trigger, input/output, rule, exception and evidence.
2. **Discovery-session contracts:** create/resume a session, append a turn, retrieve the evolving draft, expose missing information, confirm the map and convert it into a process definition.
3. **Opportunity contracts:** create an opportunity from a confirmed map/observation, record intervention candidates and evidence, and control lifecycle transitions.
4. **Workflow Library contracts:** register source and asset metadata, upload/retrieve sanitized artifacts, version assets and manage assessments.
5. **Recommendation contracts:** retrieve compatible workflow candidates and explain reasons, gaps, costs and human checkpoints.
6. **Workflow-project contracts:** create a tenant-specific configuration, generate a draft, validate and run sandbox tests.
7. **Execution contracts:** only later, request approval and dispatch an exact immutable version through a registered n8n capability.

Long-running research, ingestion, model and validation operations should be asynchronous jobs with durable state, bounded retries and explicit status. Never keep an HTTP request open while scraping or running a long workflow.

## 11. Cost and future commercialization

The first pilot is an internal operating tool, not a commercial SaaS launch. Do not provision paid production infrastructure yet. However, measure cost from the beginning.

Record per operation and, where practical, per tenant:
- model provider/model, input/output/cached tokens and cost;
- embedding/transcription/OCR use;
- search/research calls and fetched bytes;
- workflow validation and execution counts;
- external connector/API usage;
- object storage GB, egress and retention;
- application/database/queue resource use;
- retries, failures and human review effort.

Future cost model: fixed baseline hosting/security/backup/observability plus variable model, storage, search, connector and workflow execution costs. Cost will not be one fixed amount per company; it depends on active users, process count, research cadence, files, AI usage, executions, data retention, uptime and support requirements.

Before pricing, run a representative internal pilot and calculate cost per mapped process, per discovery session, per recommended workflow and per successful automation. Then model free/premium limits, enterprise controls, support, margin and overage. Do not set a retail price before measuring real unit economics.

## 12. Explicitly deferred

- Broad internet-wide scraping or ingestion of every public workflow.
- Automatic production deployment or unattended workflow modification.
- Multi-company SaaS onboarding, billing, subscription management and commercial support.
- Native macOS, Windows or Linux applications.
- Large-scale microservices, Kubernetes or multi-region deployment.
- Industry-specific packs for every sector.
- Universal BPMN execution engine or replacement for ERP/HRMS/CRM.
- Production infrastructure and final hosting/provider selection.
- Final model-provider selection and negotiated enterprise pricing.

These are not rejected. The data model, module boundaries, versioning, tenant context, provider adapters and usage accounting should leave a practical route to them.

## 13. Delivery stages and acceptance

### M1-A — Define and persist the work map
- Establish generic process/activity/actor/system/evidence contracts.
- Preserve tenant scope and audit.
- Support versioned process definitions and separate process definitions from individual cases.
- Acceptance: a user can save, retrieve, update and confirm a structured process map; tests cover incomplete maps, invalid references and tenant isolation.

### M1-B — Guided discovery session
- Persist session state and conversation turns.
- Track known facts, provenance, uncertainties and missing required information.
- Ask one or a small number of high-value follow-ups based on the current draft.
- Support resume after interruption and user corrections.
- Acceptance: a deliberately vague process description triggers follow-up questions; session can be resumed; the system does not mark the map complete until the minimum information gate is satisfied and user confirms it.

### M1-C — Opportunity assessment
- Compare automation and non-automation interventions.
- Use a documented scoring/assessment method with evidence and uncertainty.
- Acceptance: every recommendation is traceable and assumptions are visible; no unsupported score is treated as fact.

### M1-D — Curated workflow library and recommendation
- Store curated workflow assets and source references with immutable versions.
- Display requirements, costs/licences, alternatives, limitations, compatibility and verification.
- Acceptance: a user query returns relevant candidates and explains why a candidate is or is not compatible.

### M1-E — Draft workflow and controlled validation
- Generate a configuration manifest and draft artifact using approved capabilities.
- Validate structure, node/dependency versions, credentials references, data paths, secrets and tenant scope.
- Test in a sandbox with synthetic/approved data and capture results.
- Acceptance: a workflow can be generated and tested without production credentials or production execution; a human can inspect the exact artifact and evidence.

### M1 pilot exit
Use a small number of real, bounded, low-risk procedures from the current organization. Record baseline and post-change measurements. Do not claim ROI until measured using an agreed method. The pilot is complete when users can reliably map work, obtain useful recommendations, safely test at least one candidate automation and measure its actual effect.

## 14. Current repository status and next engineering actions

The existing Automation Opportunities API is only a persistence/API foundation. It is not the guided discovery experience or workflow library.

Immediate actions:
1. Harden the opportunity API: controlled opportunity statuses, no client-invented scores, typed evidence references, correct error propagation and tenant-safe tests.
2. Keep opportunity lifecycle separate from workflow-project and workflow-version lifecycles.
3. Add the work-map and discovery-session domain contracts before implementing the interview engine.
4. Build a deterministic completeness/missing-information gate first; add a provider-neutral LLM interview layer after the persistence and policy boundaries are ready.
5. Build a basic UI around the real end-to-end journey rather than a dashboard of disconnected CRUD screens.
6. Add curated workflow imports and manual registration before automated source ingestion.
7. Use the n8n 2.x self-hosted instance for sandbox testing only after explicit environment separation and credentials review.


### M1-A / M1-B implementation checkpoint — 2026-11-07

- M1-A process-model design and versioned process-model API are implemented in the Phase 2 feature branch.
- M1-B now has a first backend slice for durable discovery sessions, turns, structured fact events, revision checks and deterministic completeness.
- The M1-B slice is not yet an LLM interview or a completed browser experience. It deliberately retains raw user messages and requires explicit field-mapped fact updates.
- Session confirmation freezes a discovery snapshot; conversion to a catalogue process model remains a separate operation.
- No identity provider, model provider, sensitive workforce data, production credentials, n8n integration or deployment is enabled by this checkpoint.

## 15. Glossary for implementation work

- **API:** a server-defined interface that the browser, desktop client or another service calls. Internal CIAS APIs are not automatically paid vendor APIs.
- **REST:** a conventional HTTP API style using resources and operations such as GET, POST and PATCH.
- **Database migration:** a versioned SQL change that updates the database structure safely and reproducibly.
- **Pull request (PR):** a proposed code change from one Git branch into another. It is not a deployment.
- **Branch:** an isolated line of development.
- **Merge:** incorporates a reviewed branch into its target branch; merging into a feature branch does not mean merging into the production/main branch.
- **Workflow asset:** a stored reusable solution or reference.
- **Workflow project:** a tenant-specific configuration/design effort based on an asset or new requirements.
- **Workflow version:** an immutable exact artifact version.
- **Capability:** a registered operation the execution system is permitted to invoke.
- **Verification:** evidence that a specific version passed specified checks in a specified environment.
- **Production approval:** explicit authorization for a particular tenant, version, configuration and capability set to execute in production.
