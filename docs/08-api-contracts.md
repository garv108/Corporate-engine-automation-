# API Contracts — `/api/v1`
- GET `/departments`
- GET `/departments/{id}/processes`
- POST `/research/tasks`
- GET `/research/tasks/{id}`
- GET `/research/reports/{id}`
- GET `/opportunities`
- POST `/opportunities/discover`
- GET `/capabilities`
- GET `/capabilities/{id}/schema`
- POST `/workflow-projects`
- POST `/workflow-projects/{id}/clarifications`
- POST `/workflow-projects/{id}/generate`
- POST `/workflow-projects/{id}/validate`
- POST `/workflow-projects/{id}/sandbox-runs`
- POST `/workflow-projects/{id}/approval-requests`
- POST `/deployments/{id}/approve`
- POST `/deployments/{id}/reject`
- GET `/executions`
- GET `/analytics/overview`

Rules: enforce tenant scope server-side; cursor pagination; idempotency keys for task/execution/deployment; stable errors and correlation IDs; async resources for long jobs; never expose n8n admin credentials.
