-- Extend tenant-consistent relationships to workflow artifacts and execution metrics.

ALTER TABLE workflow_projects
  ADD CONSTRAINT workflow_projects_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE workflow_versions
  ADD COLUMN tenant_id UUID;

UPDATE workflow_versions AS versions
SET tenant_id = projects.tenant_id
FROM workflow_projects AS projects
WHERE projects.id = versions.project_id;

ALTER TABLE workflow_versions
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE workflow_versions
  DROP CONSTRAINT workflow_versions_project_id_fkey,
  ADD CONSTRAINT workflow_versions_tenant_project_fk
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES workflow_projects (tenant_id, id);

ALTER TABLE execution_metrics
  DROP CONSTRAINT execution_metrics_workflow_project_id_fkey,
  ADD CONSTRAINT execution_metrics_tenant_project_fk
    FOREIGN KEY (tenant_id, workflow_project_id)
    REFERENCES workflow_projects (tenant_id, id);

CREATE INDEX workflow_versions_tenant_project_idx
  ON workflow_versions (tenant_id, project_id);

CREATE INDEX execution_metrics_tenant_project_idx
  ON execution_metrics (tenant_id, workflow_project_id);
