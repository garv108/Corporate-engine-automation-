# OIDC Authentication and Tenant Membership

## Design
CIAS uses the OpenID Connect JWT access-token format without binding the application to a specific identity vendor. The API verifies the bearer token cryptographically against the configured JWKS endpoint, validates issuer and audience, and accepts only RS256 or ES256 signatures.

The verified token must include:
- `sub`: stable external subject identifier.
- `iss`: the configured issuer.
- `cias_tenant_id`: the internal tenant UUID as a signed custom claim.

The API then looks up an active row in `tenant_memberships` using the tenant UUID, issuer, and subject. Roles and permissions are read only from this database row. Token-supplied role or permission claims are ignored.

## Environment configuration
Set all three values together:
- `OIDC_ISSUER`: exact token issuer.
- `OIDC_AUDIENCE`: API audience expected in the token.
- `OIDC_JWKS_URL`: HTTPS JWKS endpoint used to validate token signatures.
- `OIDC_TENANT_CLAIM`: signed tenant claim name; defaults to `cias_tenant_id`.

In development, leaving the OIDC trio unset keeps authentication deny-by-default. Partial configuration is rejected. Production startup requires the OIDC trio, database URL, and CORS origin.

## Membership provisioning
Memberships are provisioned by a trusted database administrator or a future audited administrative workflow. Do not expose direct self-service tenant selection or membership creation.

Example only; replace placeholders and grant the minimum required permissions:

```sql
INSERT INTO tenant_memberships
  (tenant_id, issuer, subject, status, roles, permissions)
VALUES
  (
    '<internal-tenant-uuid>',
    '<exact-verified-issuer>',
    '<stable-oidc-subject>',
    'active',
    ARRAY['tenant_admin'],
    ARRAY[
      'departments:read',
      'departments:create',
      'departments:update',
      'business_processes:read',
      'business_processes:create',
      'business_processes:update',
      'opportunities:read',
      'opportunities:create',
      'opportunities:update'
    ]
  );
```

Use the provider's immutable subject identifier, not email address, as the identity key. A user who belongs to multiple tenants receives a token with the tenant context for the active tenant; the database membership lookup still has to confirm that exact membership.

## Security behavior
- Missing or malformed bearer credentials return unauthenticated.
- Invalid signature, issuer, audience, unsupported algorithm, missing tenant claim, or inactive membership fails closed.
- The API never derives tenant identity from `x-tenant-id`, request bodies, or query parameters.
- Permission claims in the JWT are not authoritative.
- Membership status can be changed to `suspended` or `revoked` to deny access without changing the identity-provider account.
- Do not place client secrets or signing keys in this repository. Only the public JWKS URL and non-secret issuer/audience identifiers belong in runtime configuration.

## Provider integration boundary
No identity provider is selected or connected by this change. Before production use, configure the provider to issue the required signed tenant claim and verify its exact issuer, audience, signing algorithm, and JWKS behavior in a staging environment. If a provider cannot issue the tenant claim, implement a separately reviewed tenant-context flow rather than falling back to an untrusted request header.
