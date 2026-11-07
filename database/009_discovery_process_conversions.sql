-- M1-B: link a confirmed discovery snapshot to its catalogue process and first draft model.
-- One conversion per session; the link is tenant-scoped and the operation is transactional.
CREATE TABLE process_discovery_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  process_id UUID NOT NULL,
  model_version_id UUID NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT process_discovery_conversions_tenant_session_unique UNIQUE (tenant_id, session_id),
  CONSTRAINT process_discovery_conversions_tenant_process_unique UNIQUE (tenant_id, process_id),
  CONSTRAINT process_discovery_conversions_session_fk
    FOREIGN KEY (tenant_id, session_id)
    REFERENCES process_discovery_sessions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT process_discovery_conversions_process_fk
    FOREIGN KEY (tenant_id, process_id)
    REFERENCES business_processes (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT process_discovery_conversions_model_fk
    FOREIGN KEY (tenant_id, process_id, model_version_id)
    REFERENCES business_process_model_versions (tenant_id, process_id, id) ON DELETE CASCADE
);

CREATE INDEX process_discovery_conversions_tenant_created_idx
  ON process_discovery_conversions (tenant_id, created_at DESC, id DESC);
