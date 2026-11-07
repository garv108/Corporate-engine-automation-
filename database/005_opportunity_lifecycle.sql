-- Opportunity states describe the business decision lifecycle only.
-- Workflow project/version/verification/production lifecycles remain separate.
-- Fail before adding the constraint if existing data needs explicit review.

DO $$
DECLARE
  invalid_statuses TEXT;
BEGIN
  SELECT string_agg(DISTINCT status, ', ' ORDER BY status)
    INTO invalid_statuses
  FROM automation_opportunities
  WHERE status NOT IN (
    'discovered',
    'qualified',
    'alternatives_compared',
    'business_case_drafted',
    'approval_pending',
    'approved_for_design',
    'deferred',
    'rejected'
  );

  IF invalid_statuses IS NOT NULL THEN
    RAISE EXCEPTION
      'automation_opportunities contains unsupported status values (%). Review and map these values explicitly before applying this migration.',
      invalid_statuses;
  END IF;
END $$;

ALTER TABLE automation_opportunities
  ADD CONSTRAINT automation_opportunities_status_check
  CHECK (status IN (
    'discovered',
    'qualified',
    'alternatives_compared',
    'business_case_drafted',
    'approval_pending',
    'approved_for_design',
    'deferred',
    'rejected'
  ));

ALTER TABLE automation_opportunities
  ADD CONSTRAINT automation_opportunities_evidence_refs_array_check
  CHECK (jsonb_typeof(evidence_refs) = 'array');

CREATE INDEX automation_opportunities_tenant_status_title_id_idx
  ON automation_opportunities (tenant_id, status, title, id);
