# Agent Catalog
All agents declare purpose, allowed/forbidden tools, inputs, JSON output schema, evidence rules, budget, timeout, retry and escalation behavior.

| ID | Agent | Responsibility | Output |
|---|---|---|---|
| A01 | Department Analyst | Map functions, roles, systems and processes | Department/process map |
| A02 | Opportunity Scout | Find repetitive, costly or error-prone work | Evidence-backed opportunities |
| A03 | Research Agent | Research docs, repos, papers and releases | Findings with provenance |
| A04 | Technology Analyst | Compare tools, APIs, models and hosting | Scored evaluation |
| A05 | Solution Architect | Convert requirements into solution graph | Workflow specification |
| A06 | Workflow Engineer | Generate draft using exact schemas | Workflow artifact bundle |
| A07 | QA & Security | Static checks, tests and threat review | Test/security report |
| A08 | Optimization Agent | Analyze telemetry and propose changes | Ranked proposals |

Task envelope: task_id, tenant_id, actor_id, agent_id, objective, input_refs, constraints, budget, deadline, correlation_id. Outputs include status, result, evidence_refs, confidence, warnings, token_usage, cost_estimate and next_action.

Lifecycle: queued -> running -> waiting_for_input / waiting_for_approval -> completed / failed / cancelled.
