-- M3-B hardening: make organization provisioning safe to retry after an uncertain client response.
CREATE TABLE cias_organization_provisioning_requests (
  request_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id),
  organization_name TEXT NOT NULL CHECK (length(btrim(organization_name)) BETWEEN 2 AND 200),
  issuer TEXT NOT NULL CHECK (length(issuer) BETWEEN 1 AND 2048),
  admin_subject TEXT NOT NULL CHECK (length(admin_subject) BETWEEN 1 AND 255),
  operator_subject TEXT NOT NULL CHECK (length(operator_subject) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
