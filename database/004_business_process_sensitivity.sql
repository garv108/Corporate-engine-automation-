-- Constrain business-process sensitivity to the initial CIAS classification vocabulary.
-- "unknown" is unclassified and must be treated as restricted by downstream policy
-- until a tenant-approved classification policy is available.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM business_processes
    WHERE sensitivity NOT IN ('unknown', 'public', 'internal', 'confidential', 'sensitive_workforce', 'restricted')
  ) THEN
    RAISE EXCEPTION
      'business_processes contains non-standard sensitivity values; review and map them explicitly before applying migration 004';
  END IF;
END;
$$;

ALTER TABLE business_processes
  ADD CONSTRAINT business_processes_sensitivity_check
  CHECK (sensitivity IN ('unknown', 'public', 'internal', 'confidential', 'sensitive_workforce', 'restricted'));

CREATE INDEX business_processes_tenant_name_id_idx
  ON business_processes (tenant_id, name, id);

CREATE INDEX departments_tenant_name_id_idx
  ON departments (tenant_id, name, id);
