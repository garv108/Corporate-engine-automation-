# CIAS Deployment Topology — Hybrid, n8n External

## Decision

The existing Hostinger VPS remains dedicated to n8n. CIAS will not install its API, database, Redis, web frontend, agent workers, or unrelated containers on that machine.

CIAS treats n8n as an external workflow execution provider accessed over authenticated HTTPS APIs and webhooks.

## Logical topology

1. **CIAS application environment (separate VM or managed services)**
   - React frontend and Node.js API.
   - Agent orchestration and background workers.
   - Redis/queue where needed.
   - PostgreSQL as the system of record; pgvector enabled only when semantic retrieval is implemented.
   - Object storage for larger artifacts if/when required.
2. **Existing Hostinger n8n VM**
   - n8n only, preserving the existing deployment boundary.
   - CIAS calls n8n through a narrowly scoped API credential or signed webhook.
   - Do not expose n8n admin credentials to agents or browser clients.
   - Use separate credentials and least-privilege workflows for each integration.
3. **Model inference**
   - Start with hosted model APIs behind a provider adapter.
   - Keep model selection, budgets, rate limits and provider credentials in server-side configuration.
   - Add GPU compute only for a measured workload such as local inference, fine-tuning, embeddings at scale, or multimodal processing that justifies it.

## Infrastructure selection

Prefer this order:
1. Reuse existing developer hardware for local development and integration tests.
2. Evaluate eligible always-free CPU compute for a small development/staging control plane. Verify region availability, architecture compatibility, resource limits, egress and account billing controls.
3. Evaluate startup/partner credits for larger compute.
4. Use paid compute only after load testing and a documented cost/benefit decision.

Potential programs to investigate, not guaranteed awards:
- Oracle Cloud Always Free compute (CPU VM; availability and limits vary by home region).
- Google Cloud free trial/free tier for small services (not a free GPU guarantee).
- NVIDIA Inception partner cloud credits, subject to startup acceptance and individual partner offer terms.
- NVIDIA Developer Program learning/technology benefits; do not assume these include a free always-on GPU VM.

## Security and networking

- CIAS-to-n8n communication must use HTTPS, authentication, request signing where supported, timeouts, retries with idempotency, and correlation IDs.
- Restrict inbound access to n8n where feasible; do not expose database ports publicly.
- Store credentials in server-side secret storage or encrypted environment configuration.
- Use separate development and production credentials.
- No production deployment or real customer data until access control, audit, backups, restore testing and monitoring are implemented.

## Rollout stages

### Stage A — local
Run API, web, PostgreSQL and Redis locally. Connect to n8n only through a test workflow and restricted test credential.

### Stage B — low-cost development/staging VM
Deploy the CIAS control plane to a separate VM or managed platform. Keep n8n on Hostinger. Verify TLS, backups, firewall rules, health checks, resource usage and cost alerts.

### Stage C — production readiness
Only after security and reliability gates: separate production data, identity provider, secret manager, monitoring/alerting, restore drills, rate limits and deployment approvals.

## Owner inputs required before provisioning

- Actual Hostinger n8n public base URL/domain (do not place secrets in GitHub).
- Confirmation that API access/webhooks are enabled and which n8n authentication method is configured.
- Any existing NVIDIA Inception membership/application status or cloud credits already awarded.
- Monthly infrastructure budget ceiling (including a strict ₹0 option if required).

No cloud account, VM, GPU, paid plan, or external credential should be created or purchased automatically.
