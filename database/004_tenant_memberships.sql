-- Tenant membership is the authorization source of truth after OIDC token verification.
CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  roles TEXT[] NOT NULL DEFAULT '{}',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, issuer, subject)
);

CREATE INDEX tenant_memberships_identity_lookup_idx
  ON tenant_memberships (issuer, subject, status);
