# M2-B — Read-only n8n capability inspection

## Objective

Build a verified, version-specific capability inventory for the user's dedicated self-hosted n8n Community instance. The inventory is the factual runtime input for CIAS workflow specification and assembly. It must describe what the installed instance can actually execute, not what upstream documentation or model memory suggests.

## Scope

### Read-only discovery
- Identify exact n8n version and deployment/runtime metadata needed for compatibility.
- Enumerate installed node types, package provenance, node type versions, operations, and parameter definitions where exposed by supported interfaces.
- Enumerate credential *type definitions* and required fields, never credential instances or secret values.
- Classify built-in, community, and custom nodes.
- Capture package versions, source, license/provenance when verifiable.
- Record source, collection time, runtime version, completeness, and verification status for every inventory snapshot.
- Classify node capabilities and risk (network, filesystem, shell/code execution, external side effects, trigger/webhook, credential use).

### Integration with CIAS
- Normalize the inventory into the M2-A Workflow Library contract's capability references.
- Preserve exact n8n node type identifiers and node type versions.
- Mark unknown, unavailable, or unverified metadata explicitly; do not infer it.
- Produce a compatibility matrix and machine-readable snapshot suitable for later static validation.

## Explicit non-goals

- No workflow creation, modification, activation, publishing, execution, or deletion.
- No credential creation, retrieval, update, or testing.
- No package installation, update, or removal.
- No n8n configuration changes, database access, SSH access, or Hostinger VM administration.
- No access to execution payloads, customer data, or workflow contents unless a later separately approved task requires a narrowly scoped sample.
- No secrets in ChatGPT, GitHub, source files, manifests, CI logs, or inventory output.

## Access and trust model

Preferred order:

1. User exports the documented node/credential-type metadata resources from the authenticated n8n UI/session and uploads sanitized JSON. This is the initial low-risk path.
2. If repeatable synchronization is needed, introduce a small, separately hosted read-only inventory proxy with an allowlist of exact metadata routes, strict authentication, rate limits, audit logging, and no general-purpose proxying. It must not expose n8n's administrative API or secrets.
3. A direct API integration is considered only after verifying the Community edition's actual authorization semantics. Do not assume a Community API key is read-only. Never request or store a broad API key in GitHub or chat.

The dedicated Hostinger VM can remain dedicated to n8n. CIAS does not require additional services to be hosted on that VM. A reachable HTTPS hostname is a transport prerequisite only; it does not itself grant ChatGPT access.

## Collection protocol

1. Confirm the canonical HTTPS base URL and exact n8n version with the user, without requesting credentials in chat.
2. Determine which metadata routes are available in the installed version and what authentication they require.
3. Collect node definitions, node-version metadata, credential type definitions, and installed package inventory.
4. Validate JSON shape, completeness, duplicate identifiers, package attribution, and version consistency.
5. Redact accidental secrets or instance-specific sensitive metadata before persistence.
6. Normalize into a timestamped immutable inventory snapshot with source references and verification state.
7. Generate a report of missing/unknown fields and risk flags for human review.

## Deliverables

- Runtime profile.
- Normalized node catalogue.
- Node-version and operation/parameter metadata.
- Credential-type catalogue (schemas only).
- Package/provenance/license register.
- Capability risk classification.
- Compatibility matrix.
- Completeness and verification report.
- Reproducible read-only collection procedure.

## Acceptance criteria

- Inventory identifies the exact installed n8n version and collection timestamp.
- Every discovered node has an exact type identifier and a source/provenance status.
- Node type versions and operation/parameter schemas are captured when the installed instance exposes them; missing data is marked unknown, not fabricated.
- Credential metadata contains definitions only and is proven free of credential instances and secret values.
- Built-in/community/custom classification is explicit, with unresolved classifications flagged.
- Risky execution capabilities are flagged for later workflow policy enforcement.
- Snapshot is reproducible and immutable; changes produce a new snapshot rather than overwriting history.
- Inspection causes no writes or operational changes to the n8n instance.
- No secrets or workflow/customer payloads are committed to Git.

## Exit gate

M2-B is complete when the inventory passes schema and completeness checks and a reviewer can determine, for a proposed node, its exact installed version, configuration contract, credential type requirements, provenance, risk, and compatibility status. Only then should M2-C implement persistence/search over the verified catalogue.
