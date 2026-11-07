-- M1-A: versioned, tenant-scoped business process models.
-- The catalogue row remains the stable process identity; model versions are immutable
-- once confirmed, and model steps/transitions/facts can only be changed while draft.

CREATE TABLE business_process_model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  process_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'published')),
  purpose TEXT,
  scope TEXT,
  trigger_definition TEXT,
  expected_outcome TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  published_by TEXT,
  published_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_process_model_versions_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT business_process_model_versions_tenant_process_id_unique UNIQUE (tenant_id, process_id, id),
  CONSTRAINT business_process_model_versions_tenant_process_version_unique UNIQUE (tenant_id, process_id, version),
  CONSTRAINT business_process_model_versions_process_fk
    FOREIGN KEY (tenant_id, process_id)
    REFERENCES business_processes (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT business_process_model_versions_confirmation_state_check CHECK (
    (status = 'draft' AND confirmed_by IS NULL AND confirmed_at IS NULL AND published_by IS NULL AND published_at IS NULL)
    OR
    (status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND published_by IS NULL AND published_at IS NULL)
    OR
    (status = 'published' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE INDEX business_process_model_versions_tenant_process_idx
  ON business_process_model_versions (tenant_id, process_id, version DESC);

CREATE TABLE business_process_model_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  model_version_id UUID NOT NULL,
  step_key TEXT NOT NULL CHECK (length(step_key) BETWEEN 1 AND 64),
  kind TEXT NOT NULL CHECK (kind IN ('start', 'end', 'activity', 'decision', 'event', 'handoff', 'subprocess')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  description TEXT,
  participant_kind TEXT CHECK (participant_kind IN ('person', 'role', 'team', 'system', 'external_party', 'unknown')),
  participant_label TEXT,
  participant_reference TEXT,
  systems JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(systems) = 'array'),
  inputs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(inputs) = 'array'),
  outputs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(outputs) = 'array'),
  rules JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rules) = 'array'),
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exceptions) = 'array'),
  human_judgement TEXT,
  layout JSONB CHECK (layout IS NULL OR jsonb_typeof(layout) = 'object'),
  attributes_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (attributes_schema_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_process_model_steps_tenant_version_id_unique UNIQUE (tenant_id, model_version_id, id),
  CONSTRAINT business_process_model_steps_tenant_version_key_unique UNIQUE (tenant_id, model_version_id, step_key),
  CONSTRAINT business_process_model_steps_version_fk
    FOREIGN KEY (tenant_id, model_version_id)
    REFERENCES business_process_model_versions (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX business_process_model_steps_tenant_version_idx
  ON business_process_model_steps (tenant_id, model_version_id);

CREATE TABLE business_process_model_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  model_version_id UUID NOT NULL,
  from_step_id UUID NOT NULL,
  to_step_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sequence'
    CHECK (kind IN ('sequence', 'conditional', 'exception', 'default', 'parallel')),
  label TEXT,
  condition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_process_model_transitions_from_step_fk
    FOREIGN KEY (tenant_id, model_version_id, from_step_id)
    REFERENCES business_process_model_steps (tenant_id, model_version_id, id) ON DELETE CASCADE,
  CONSTRAINT business_process_model_transitions_to_step_fk
    FOREIGN KEY (tenant_id, model_version_id, to_step_id)
    REFERENCES business_process_model_steps (tenant_id, model_version_id, id) ON DELETE CASCADE
);

CREATE INDEX business_process_model_transitions_tenant_version_idx
  ON business_process_model_transitions (tenant_id, model_version_id);

CREATE TABLE business_process_model_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  model_version_id UUID NOT NULL,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('user_input', 'direct_observation', 'system_record', 'external_document', 'synthetic_fixture', 'derived_calculation')),
  source_label TEXT NOT NULL CHECK (length(source_label) BETWEEN 1 AND 200),
  source_reference TEXT,
  source_version TEXT,
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  license TEXT,
  classification TEXT NOT NULL DEFAULT 'unknown'
    CHECK (classification IN ('unknown', 'public', 'internal', 'confidential', 'sensitive_workforce', 'restricted')),
  observed_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ,
  recorded_by TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_process_model_evidence_tenant_version_id_unique UNIQUE (tenant_id, model_version_id, id),
  CONSTRAINT business_process_model_evidence_version_fk
    FOREIGN KEY (tenant_id, model_version_id)
    REFERENCES business_process_model_versions (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX business_process_model_evidence_tenant_version_idx
  ON business_process_model_evidence (tenant_id, model_version_id);

CREATE TABLE business_process_model_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  model_version_id UUID NOT NULL,
  step_id UUID,
  evidence_id UUID,
  field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 256),
  value JSONB NOT NULL,
  provenance_kind TEXT NOT NULL
    CHECK (provenance_kind IN ('user_statement', 'direct_observation', 'approved_system_record', 'external_document', 'ai_hypothesis', 'synthetic_fixture', 'derived_calculation')),
  review_state TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_state IN ('unreviewed', 'user_confirmed', 'verified', 'disputed', 'rejected')),
  recorded_by TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_process_model_facts_version_fk
    FOREIGN KEY (tenant_id, model_version_id)
    REFERENCES business_process_model_versions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT business_process_model_facts_step_fk
    FOREIGN KEY (tenant_id, model_version_id, step_id)
    REFERENCES business_process_model_steps (tenant_id, model_version_id, id),
  CONSTRAINT business_process_model_facts_evidence_fk
    FOREIGN KEY (tenant_id, model_version_id, evidence_id)
    REFERENCES business_process_model_evidence (tenant_id, model_version_id, id)
);

CREATE INDEX business_process_model_facts_tenant_version_idx
  ON business_process_model_facts (tenant_id, model_version_id, field_path);
CREATE INDEX business_process_model_facts_evidence_idx
  ON business_process_model_facts (tenant_id, evidence_id)
  WHERE evidence_id IS NOT NULL;

-- A draft can be edited or confirmed. A confirmed snapshot may only be published,
-- and publishing may only add publication metadata. Published content never mutates.
CREATE OR REPLACE FUNCTION cias_guard_process_model_version_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published process model versions are immutable' USING ERRCODE = '55000';
  ELSIF OLD.status = 'confirmed' THEN
    IF NEW.status <> 'published'
      OR ROW(
        NEW.tenant_id, NEW.process_id, NEW.version, NEW.purpose, NEW.scope,
        NEW.trigger_definition, NEW.expected_outcome, NEW.schema_version,
        NEW.content_hash, NEW.confirmed_by, NEW.confirmed_at, NEW.created_by, NEW.created_at
      ) IS DISTINCT FROM ROW(
        OLD.tenant_id, OLD.process_id, OLD.version, OLD.purpose, OLD.scope,
        OLD.trigger_definition, OLD.expected_outcome, OLD.schema_version,
        OLD.content_hash, OLD.confirmed_by, OLD.confirmed_at, OLD.created_by, OLD.created_at
      ) THEN
      RAISE EXCEPTION 'Confirmed process model versions are immutable except for publication' USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Invalid process model version state transition' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_process_model_versions_immutable
BEFORE UPDATE ON business_process_model_versions
FOR EACH ROW EXECUTE FUNCTION cias_guard_process_model_version_update();

-- Prevent child records from being inserted or updated once their parent version
-- leaves draft. Deletes are reserved for retention/erasure controls, not API edits.
CREATE OR REPLACE FUNCTION cias_guard_process_model_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO parent_status
      FROM business_process_model_versions
      WHERE tenant_id = OLD.tenant_id AND id = OLD.model_version_id
      FOR KEY SHARE;
    IF parent_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Only draft process model children may be changed' USING ERRCODE = '55000';
    END IF;
  END IF;

  SELECT status INTO parent_status
    FROM business_process_model_versions
    WHERE tenant_id = NEW.tenant_id AND id = NEW.model_version_id
    FOR KEY SHARE;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft process model children may be inserted or changed' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER business_process_model_steps_draft_only
BEFORE INSERT OR UPDATE ON business_process_model_steps
FOR EACH ROW EXECUTE FUNCTION cias_guard_process_model_child_mutation();

CREATE TRIGGER business_process_model_transitions_draft_only
BEFORE INSERT OR UPDATE ON business_process_model_transitions
FOR EACH ROW EXECUTE FUNCTION cias_guard_process_model_child_mutation();

CREATE TRIGGER business_process_model_evidence_draft_only
BEFORE INSERT OR UPDATE ON business_process_model_evidence
FOR EACH ROW EXECUTE FUNCTION cias_guard_process_model_child_mutation();

CREATE TRIGGER business_process_model_facts_draft_only
BEFORE INSERT OR UPDATE ON business_process_model_facts
FOR EACH ROW EXECUTE FUNCTION cias_guard_process_model_child_mutation();
