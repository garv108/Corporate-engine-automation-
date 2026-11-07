-- OIDC tenant membership is the authorization source of truth after verified token validation.
-- The membership key binds an issuer + immutable subject to one tenant.
CREATE OR REPLACE FUNCTION cias_valid_membership_string_array(
  candidate TEXT[],
  max_items INTEGER,
  max_item_length INTEGER
)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $membership$
  SELECT candidate IS NOT NULL
    AND cardinality(candidate) <= max_items
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(candidate) AS item(value)
      WHERE value IS NULL
         OR length(value) < 1
         OR length(value) > max_item_length
         OR btrim(value) = ''
    );
$membership$;

CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  issuer TEXT NOT NULL CHECK (length(issuer) BETWEEN 1 AND 2048),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  roles TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cias_valid_membership_string_array(roles, 50, 100)),
  permissions TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cias_valid_membership_string_array(permissions, 200, 150)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_tenant_issuer_subject_unique
    UNIQUE (tenant_id, issuer, subject)
);

CREATE INDEX tenant_memberships_tenant_status_idx
  ON tenant_memberships (tenant_id, status);

CREATE OR REPLACE FUNCTION cias_set_tenant_membership_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenant_memberships_updated_at
BEFORE UPDATE ON tenant_memberships
FOR EACH ROW EXECUTE FUNCTION cias_set_tenant_membership_updated_at();

-- Provisioning is privileged and deliberately has no self-service API in this milestone.
-- Record inserts, permission changes, suspensions and deletion in the same transaction.
-- The actor is the database session principal until a trusted, audited admin command exists.
CREATE OR REPLACE FUNCTION cias_audit_tenant_membership_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_tenant_id UUID;
  target_membership_id UUID;
  action_name TEXT;
  event_metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_tenant_id := NEW.tenant_id;
    target_membership_id := NEW.id;
    action_name := 'tenant_membership.created';
    event_metadata := jsonb_build_object(
      'membershipId', NEW.id,
      'status', NEW.status,
      'roles', to_jsonb(NEW.roles),
      'permissions', to_jsonb(NEW.permissions)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    target_tenant_id := NEW.tenant_id;
    target_membership_id := NEW.id;
    action_name := 'tenant_membership.updated';
    event_metadata := jsonb_build_object(
      'membershipId', NEW.id,
      'previousStatus', OLD.status,
      'status', NEW.status,
      'previousRoles', to_jsonb(OLD.roles),
      'roles', to_jsonb(NEW.roles),
      'previousPermissions', to_jsonb(OLD.permissions),
      'permissions', to_jsonb(NEW.permissions)
    );
  ELSE
    target_tenant_id := OLD.tenant_id;
    target_membership_id := OLD.id;
    action_name := 'tenant_membership.deleted';
    event_metadata := jsonb_build_object(
      'membershipId', OLD.id,
      'previousStatus', OLD.status,
      'roles', to_jsonb(OLD.roles),
      'permissions', to_jsonb(OLD.permissions)
    );
  END IF;

  INSERT INTO audit_events (
    tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata
  ) VALUES (
    target_tenant_id,
    'database',
    session_user,
    action_name,
    'tenant_membership',
    target_membership_id::text,
    'allowed',
    event_metadata
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenant_memberships_audit
AFTER INSERT OR UPDATE OR DELETE ON tenant_memberships
FOR EACH ROW EXECUTE FUNCTION cias_audit_tenant_membership_change();
