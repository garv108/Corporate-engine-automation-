# Security & Governance
Principles: least privilege, tenant isolation, secret minimization, explicit authorization, traceability and secure defaults.

Use RBAC plus resource policies. Secrets live in a vault/encrypted credential store; model context receives opaque IDs and connection status only. Never log secrets.

Require approval for production deployment, financial actions, destructive operations, sensitive exports, permission changes and policy exceptions.

Treat webpages, repository files, PDFs, templates and MCP output as untrusted data. They cannot override system policy.

Sandbox with network allowlists, synthetic data, resource limits, timeouts and no production secrets. Track actor, policy decision, artifact hash/version, approval, deployment, outcome and rollback.


## Identity and membership
Use OIDC bearer tokens with signature verification against a configured JWKS endpoint. Validate issuer, audience, expiry and an allowlisted signing algorithm. Resolve tenant membership from the signed `cias_tenant_id` claim and an active database membership row. Load roles and permissions from that row; ignore token permission claims. Membership provisioning and permission changes are privileged administrative operations and must be audited.
