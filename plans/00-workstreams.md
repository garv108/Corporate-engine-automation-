# Workstream Register
| ID | Workstream | Deliverable | Dependency |
|---|---|---|---|
| WS-01 | Product definition | Charter, personas, requirements | — |
| WS-02 | Architecture | Components, boundaries, ADRs | WS-01 |
| WS-03 | Agent system | Agent contracts/evals | WS-01/02 |
| WS-04 | Skills library | Portable Skills | WS-03 |
| WS-05 | Research intelligence | Source adapters/pipeline | WS-02/07 |
| WS-06 | Capability registry | Nodes/tools/APIs/Skills/templates | WS-02/09 |
| WS-07 | Workflow intelligence | Request-to-draft pipeline | WS-03/06/08 |
| WS-08 | Knowledge management | DB, RAG, provenance | WS-02 |
| WS-09 | Execution infrastructure | n8n, LangGraph, queue, sandbox | WS-02 |
| WS-10 | Security/governance | IAM, secrets, approvals, audit | WS-02 |
| WS-11 | UI/analytics | Dashboard and command center | WS-07/08/09 |
| WS-12 | Quality/evolution | Evaluation, monitoring, optimization | All |

Milestone 1: department name -> process map + evidence-linked findings + scored opportunities + searchable records.
Milestone 2: natural-language request -> clarification + workflow spec + exact node inventory + draft + config manifest + validation report.
Milestone 3: approved draft -> deployed version + audit trail + tested rollback.
