# OIDC Authentication and Tenant Membership

**Status:** Provider-neutral authentication implementation; no identity provider is selected or connected.

## 1. Accepted token profile

CIAS accepts a signed JWT **OAuth access token** using the RFC 9068-style access-token profile. It does not accept an OpenID Connect ID token or an arbitrary JWT as an API bearer credential.

The verifier requires:

- Protected header `typ: at+jwt`.
- Signing algorithm `RS256` or `ES256`; all other algorithms are rejected.
- Exact configured `iss` (issuer).
- Configured API `aud` (audience).
- `exp` (expiration), validated by the JWT verifier with five seconds of clock-skew tolerance.
- `iat` (issued-at), required, numeric and not more than five seconds in the future.
- `sub` (subject), required and bounded to 255 characters.
- `jti` (token identifier), required and bounded to 255 characters.
- `client_id`, required and bounded to 255 characters.
- The configured signed tenant claim (default `cias_tenant_id`), containing a UUID for an internal CIAS tenant.

The verifier checks the signature against the configured HTTPS JWKS endpoint before using claims. It rejects oversized bearer tokens, unsupported algorithms, invalid signatures, missing or malformed required claims, expired tokens, wrong token type, issuer or audience mismatches, and malformed tenant identifiers.

The application uses `jose` 6.2.15 behind the identity adapter. Remote JWKS resolution has a five-second timeout, thirty-second cooldown and ten-minute cache age. Token claims are never trusted before signature and profile verification succeeds.

## 2. Tenant membership and authorization

A signed tenant claim is not sufficient by itself. CIAS requires an active row in `tenant_memberships` matching:

- exact internal `tenant_id`;
- exact configured `issuer`;
- exact immutable external `subject`;
- membership status `active`.

The parent tenant must also have status `active`. Suspended or revoked memberships and inactive tenants fail closed.

Roles and permissions are loaded only from the matching database membership. Token-supplied role/permission claims are ignored. Application routes continue to derive tenant context from the verified `AuthenticatedPrincipal`; caller-supplied tenant headers and body fields are never authoritative.

## 3. Membership provisioning and audit

There is no self-service membership or permission-management API in this slice. Memberships are provisioned by a trusted database administrator or a future separately reviewed administrative workflow.

Migration `008_tenant_memberships.sql` creates the membership relation and transactional audit triggers. Inserts, permission/role updates, suspensions and deletion create an `audit_events` record. Audit metadata includes the membership identifier and previous/new state and grants, but excludes the external subject and issuer values. The database session role is recorded as the actor until a trusted administrative command with authenticated actor context is implemented.

The database role used by CIAS must not be granted unrestricted membership-management privileges to ordinary application paths. Permission changes are privileged operations.

## 4. Environment configuration

All three values must be configured together:

- `OIDC_ISSUER`: exact HTTPS issuer identifier expected in the token.
- `OIDC_AUDIENCE`: audience expected by the CIAS API.
- `OIDC_JWKS_URL`: HTTPS JWKS endpoint used to verify signatures.

Optional:

- `OIDC_TENANT_CLAIM`: name of the signed tenant claim; defaults to `cias_tenant_id`.

In development and tests, leaving the OIDC trio unset keeps the default verifier deny-by-default. Partial configuration is rejected. Production startup requires the OIDC trio, database URL and CORS origin.

Do not commit provider client secrets, signing keys, private keys or access tokens. Only the non-secret issuer/audience identifiers and public JWKS URL belong in environment configuration.

## 5. Staging acceptance before production

Before configuring a provider or enabling OIDC in a deployed environment, verify with that provider:

- it issues JWT access tokens with the expected `at+jwt` type and required claims;
- issuer and audience values exactly match the CIAS configuration;
- signing keys are discoverable through the configured HTTPS JWKS endpoint and rotate correctly;
- RS256 or ES256 is supported and no other signing algorithm is required;
- access-token expiry and clock skew fit the verifier behavior;
- the tenant claim is added only by a trusted identity-side mapping and cannot be selected by a client;
- memberships are provisioned with least privilege and changes are audited.

No identity provider is selected by this code change. Provider compatibility, staging configuration and credentials require a separate explicit decision. Production rollout is not part of this PR.
