# M1-C — Evidence-Based Opportunity Assessment

**Status:** Implementation contract for the first intervention-comparison slice  
**Depends on:** M1-A process models and M1-B confirmed discovery-to-catalogue conversion  
**Scope:** One tenant's confirmed process map and its improvement candidates

## 1. Objective

Turn a confirmed process map into a defensible set of improvement options. CIAS must compare automation with non-automation interventions and preserve the evidence, assumptions, constraints and human rationale behind every assessment.

The output is a ranked comparison aid, not an autonomous business decision, ROI guarantee or authorization to build/deploy a workflow.

## 2. Domain boundaries

- **Opportunity:** the problem or improvement area to address.
- **Evidence:** a source-linked observation or assertion supporting a claim about the opportunity or process.
- **Intervention candidate:** one possible response: automation, process redesign, policy simplification, training, capacity change, data-quality remediation or another explicitly described option.
- **Assessment:** an immutable, versioned evaluation of one candidate using a named scoring method, explicit dimensions, rationale, assumptions and linked evidence.
- **Selection:** a human decision to shortlist/select a candidate for further business-case work. It is not approval for workflow design, production deployment or execution.
- **Outcome:** measured change against a recorded baseline. Forecasts and estimates are not outcomes.

An opportunity may have multiple candidates and each candidate may have multiple assessment versions. Never collapse an opportunity into a single automation recommendation.

## 3. M1-C scope

### In scope
1. Register tenant-scoped evidence records with source kind, claim, source label/reference/version, content hash, classification and observation/retrieval timestamps.
2. Create and list intervention candidates for an opportunity.
3. Compare automation and non-automation intervention types using one deterministic, versioned rubric.
4. Create immutable assessment snapshots with explicit assumptions, expected-impact range, per-dimension rationale and linked evidence.
5. Compute the aggregate score on the server. Never accept a caller-supplied aggregate score.
6. Support explicit candidate status transitions and audit all writes.
7. Require at least two assessed, non-rejected/non-deferred candidates before moving an opportunity to \`alternatives_compared\`.
8. Keep the existing opportunity lifecycle and production-approval boundary intact.

### Out of scope
- AI-generated or AI-autonomous scores.
- Automatic opportunity discovery from telemetry or external research.
- Process mining, case/event ingestion or inferred bottleneck claims.
- Financial ROI or payback claims without an explicit baseline, period, units and cost assumptions.
- Workflow-library retrieval, workflow generation, n8n execution or deployment.
- Autonomous selection, employee ranking, workforce decisions or approval.

## 4. Evidence record

Each evidence record belongs to one tenant and one opportunity. Required fields:

- \`sourceKind\`: \`user_statement\`, \`direct_observation\`, \`approved_system_record\`, \`external_document\`, \`synthetic_fixture\` or \`derived_calculation\`;
- \`claim\`: the specific statement this evidence supports;
- \`sourceLabel\`;
- optional \`sourceReference\`, \`sourceVersion\`, \`contentHash\`, \`observedAt\` and \`retrievedAt\`;
- \`classification\`: \`unknown\`, \`public\`, \`internal\`, \`confidential\`, \`sensitive_workforce\` or \`restricted\`;
- actor and recorded timestamp.

Evidence is immutable after creation. \`unknown\` is treated as restricted by downstream policy. An external URL is a reference, not proof of source authenticity, freshness, accuracy or redistribution rights. Evidence must not contain secrets.

## 5. Intervention candidate

Allowed initial types:

- \`automation\`
- \`process_redesign\`
- \`policy_simplification\`
- \`training\`
- \`capacity_change\`
- \`data_quality\`
- \`other\`

Each candidate records a title, description, assumptions, dependencies, limitations and human checkpoints. Candidate status:

\`proposed → shortlisted → selected\`

Alternative terminal states: \`rejected\`, \`deferred\`. Rejected/deferred candidates cannot be selected without a new candidate record. At most one candidate may be selected per opportunity at a time.

Selecting a candidate does not move the opportunity to \`approved_for_design\`.

## 6. Deterministic scoring method

Method ID: \`CIAS-INTERVENTION-V1\`.

Each dimension is rated from 1 to 5 with a required written rationale:

| Dimension | 1 | 5 | Weight |
|---|---|---|---:|
| Expected impact | Very low | Very high | 30% |
| Feasibility | Very difficult | Very feasible | 25% |
| Implementation effort | Very low effort | Very high effort | 15% (inverse) |
| Operational risk | Very low risk | Very high risk | 15% (inverse) |
| Evidence strength | Anecdotal/weak | Measured/strong | 15% |

Server formula:

\[
\text{score} = \frac{100}{5}\left(
0.30I + 0.25F + 0.15(6-E) + 0.15(6-R) + 0.15S
\right)
\]

where \`I\` is impact, \`F\` feasibility, \`E\` effort, \`R\` risk and \`S\` evidence strength. Round to one decimal place.

This is an initial transparent heuristic, not a statistically calibrated predictor. The score is for comparing candidates under the same method version. It is not confidence, probability of success, financial ROI or permission to proceed. Keep the dimensions and rationales visible; never show the aggregate alone.

A later method change requires a new scoring-method version. Historical assessments retain their original method and score.

## 7. Assessment snapshot

Each assessment records:

- candidate and opportunity IDs;
- monotonically increasing version per candidate;
- scoring method version;
- five dimension ratings and individual rationales;
- server-computed aggregate score;
- overall rationale;
- assumptions;
- expected impact range with explicit unit and time period where known;
- one or more evidence links;
- evaluator and evaluation timestamp.

Assessment snapshots are immutable. Corrections create a new version. A missing baseline remains missing; do not manufacture a time-saved, cost-saving or ROI figure.

## 8. Lifecycle gates

- An opportunity may move from \`qualified\` to \`alternatives_compared\` only when at least two eligible candidates each have an assessment.
- An opportunity can proceed from \`alternatives_compared\` to \`business_case_drafted\` only after a human has selected one candidate and a separate business-case record is implemented. Until that record exists, the transition remains blocked.
- \`approved_for_design\` remains a separate permission-gated business decision.
- Workflow design approval, production approval and execution authorization remain separate downstream controls.

## 9. Security and audit

- Derive tenant and actor only from the verified principal.
- Enforce tenant scope on opportunity, evidence, candidate, assessment and join-table reads/writes.
- Use composite foreign keys to prevent cross-tenant relationships.
- Evidence and assessments are append-only; candidate status changes are validated and audited.
- Permission checks are separate for evidence creation, intervention creation/update, assessment and opportunity approval.
- Do not expose secret values or allow an LLM to bypass deterministic validation.

## 10. Acceptance criteria

1. A tenant can attach source-linked evidence to an opportunity.
2. The tenant can create automation and non-automation candidates.
3. Each candidate can receive one or more immutable, evidence-linked assessments.
4. The API computes the same score for the same method/version and dimension values.
5. Caller-supplied scores are rejected.
6. Cross-tenant evidence/candidate/assessment references are rejected.
7. An opportunity cannot enter \`alternatives_compared\` with fewer than two assessed candidates.
8. Selecting a candidate does not grant design or execution permission.
9. Audit records commit atomically with each mutation.
10. Tests cover positive, invalid, duplicate, stale, cross-tenant and permission-denied cases.
