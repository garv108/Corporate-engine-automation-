-- M3-B: trusted control-plane operators and controlled tenant provisioning.
-- There is deliberately no public organization-signup or membership-management endpoint.

CREATE TABLE cias_platform_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer TEXT NOT NULL CHECK (length(issuer) BETWEEN 1 AND 2048),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE INDEX cias_platform_operators_status_idx
  ON cias_platform_operators (status);

CREATE OR REPLACE FUNCTION cias_audit_tenant_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id UUID;
  action_name TEXT;
  event_metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_id := NEW.id;
    action_name := 'tenant.created';
    event_metadata := jsonb_build_object('name', NEW.name, 'status', NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    target_id := NEW.id;
    action_name := 'tenant.updated';
    event_metadata := jsonb_build_object(
      'previousName', OLD.name, 'name', NEW.name,
      'previousStatus', OLD.status, 'status', NEW.status
    );
  ELSE
    target_id := OLD.id;
    action_name := 'tenant.deleted';
    event_metadata := jsonb_build_object('name', OLD.name, 'status', OLD.status);
  END IF;

  INSERT INTO audit_events (
    tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata
  ) VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE target_id END,
    'database', session_user, action_name, 'tenant', target_id::text, 'allowed', event_metadata
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_audit
AFTER INSERT OR UPDATE OR DELETE ON tenants
FOR EACH ROW EXECUTE FUNCTION cias_audit_tenant_change();

CREATE OR REPLACE FUNCTION cias_audit_platform_operator_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id UUID;
  action_name TEXT;
  event_metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_id := NEW.id;
    action_name := 'platform_operator.created';
    event_metadata := jsonb_build_object('operatorId', NEW.id, 'status', NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    target_id := NEW.id;
    action_name := 'platform_operator.updated';
    event_metadata := jsonb_build_object(
      'operatorId', NEW.id, 'previousStatus', OLD.status, 'status', NEW.status
    );
  ELSE
    target_id := OLD.id;
    action_name := 'platform_operator.deleted';
    event_metadata := jsonb_build_object('operatorId', OLD.id, 'status', OLD.status);
  END IF;

  INSERT INTO audit_events (
    tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata
  ) VALUES (
    NULL, 'database', session_user, action_name, 'platform_operator', target_id::text, 'allowed', event_metadata
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cias_platform_operators_audit
AFTER INSERT OR UPDATE OR DELETE ON cias_platform_operators
FOR EACH ROW EXECUTE FUNCTION cias_audit_platform_operator_change();
