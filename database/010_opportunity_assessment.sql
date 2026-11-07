-- M1-C: source-linked opportunity evidence, intervention candidates and immutable assessments.
-- The base table has a globally unique ID but needs this composite key for tenant-preserving FKs.
CREATE UNIQUE INDEX IF NOT EXISTS automation_opportunities_tenant_id_id_unique_idx
  ON automation_opportunities (tenant_id, id);

CREATE TABLE opportunity_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'user_statement','direct_observation','approved_system_record',
    'external_document','synthetic_fixture','derived_calculation'
  )),
  claim TEXT NOT NULL CHECK (length(claim) BETWEEN 5 AND 4000),
  source_label TEXT NOT NULL CHECK (length(source_label) BETWEEN 1 AND 200),
  source_reference TEXT,
  source_version TEXT,
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  classification TEXT NOT NULL DEFAULT 'unknown'
    CHECK (classification IN ('unknown','public','internal','confidential','sensitive_workforce','restricted')),
  observed_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ,
  recorded_by TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_evidence_tenant_opportunity_id_unique UNIQUE (tenant_id, opportunity_id, id),
  CONSTRAINT opportunity_evidence_opportunity_fk
    FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES automation_opportunities (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX opportunity_evidence_tenant_opportunity_created_idx
  ON opportunity_evidence (tenant_id, opportunity_id, recorded_at DESC, id DESC);

CREATE TABLE opportunity_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'automation','process_redesign','policy_simplification','training',
    'capacity_change','data_quality','other'
  )),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 200),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 5 AND 4000),
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumptions)='array'),
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dependencies)='array'),
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(limitations)='array'),
  human_checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(human_checkpoints)='array'),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','shortlisted','selected','rejected','deferred')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_interventions_tenant_opportunity_id_unique UNIQUE (tenant_id, opportunity_id, id),
  CONSTRAINT opportunity_interventions_opportunity_fk
    FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES automation_opportunities (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX opportunity_interventions_tenant_opportunity_status_idx
  ON opportunity_interventions (tenant_id, opportunity_id, status, created_at, id);
CREATE UNIQUE INDEX opportunity_interventions_one_selected_per_opportunity_idx
  ON opportunity_interventions (tenant_id, opportunity_id)
  WHERE status='selected';

CREATE TABLE opportunity_intervention_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  intervention_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  scoring_method_version TEXT NOT NULL CHECK (length(scoring_method_version) BETWEEN 1 AND 80),
  dimension_scores JSONB NOT NULL CHECK (jsonb_typeof(dimension_scores)='object'),
  overall_score NUMERIC(5,1) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 10 AND 4000),
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumptions)='array'),
  expected_impact JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(expected_impact)='object'),
  evaluated_by TEXT NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_assessments_tenant_opportunity_intervention_id_unique
    UNIQUE (tenant_id, opportunity_id, intervention_id, id),
  CONSTRAINT opportunity_assessments_tenant_intervention_version_unique
    UNIQUE (tenant_id, opportunity_id, intervention_id, version),
  CONSTRAINT opportunity_assessments_intervention_fk
    FOREIGN KEY (tenant_id, opportunity_id, intervention_id)
    REFERENCES opportunity_interventions (tenant_id, opportunity_id, id) ON DELETE CASCADE
);
CREATE INDEX opportunity_assessments_tenant_intervention_version_idx
  ON opportunity_intervention_assessments (tenant_id, opportunity_id, intervention_id, version DESC);

CREATE TABLE opportunity_assessment_evidence (
  tenant_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  intervention_id UUID NOT NULL,
  assessment_id UUID NOT NULL,
  evidence_id UUID NOT NULL,
  linked_by TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, assessment_id, evidence_id),
  CONSTRAINT opportunity_assessment_evidence_assessment_fk
    FOREIGN KEY (tenant_id, opportunity_id, intervention_id, assessment_id)
    REFERENCES opportunity_intervention_assessments (tenant_id, opportunity_id, intervention_id, id) ON DELETE CASCADE,
  CONSTRAINT opportunity_assessment_evidence_evidence_fk
    FOREIGN KEY (tenant_id, opportunity_id, evidence_id)
    REFERENCES opportunity_evidence (tenant_id, opportunity_id, id) ON DELETE CASCADE
);
CREATE INDEX opportunity_assessment_evidence_tenant_evidence_idx
  ON opportunity_assessment_evidence (tenant_id, evidence_id);


-- Evidence and assessment snapshots may be superseded by new records, never edited in place.
CREATE OR REPLACE FUNCTION cias_reject_opportunity_snapshot_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Opportunity evidence and assessment snapshots are immutable; create a new record' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER opportunity_evidence_immutable_update
  BEFORE UPDATE ON opportunity_evidence
  FOR EACH ROW EXECUTE FUNCTION cias_reject_opportunity_snapshot_update();
CREATE TRIGGER opportunity_assessments_immutable_update
  BEFORE UPDATE ON opportunity_intervention_assessments
  FOR EACH ROW EXECUTE FUNCTION cias_reject_opportunity_snapshot_update();
CREATE TRIGGER opportunity_assessment_evidence_immutable_update
  BEFORE UPDATE ON opportunity_assessment_evidence
  FOR EACH ROW EXECUTE FUNCTION cias_reject_opportunity_snapshot_update();
