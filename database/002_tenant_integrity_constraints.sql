-- Enforce tenant consistency at the database boundary.
-- The application must still scope every query to the authenticated tenant.

ALTER TABLE departments
  ADD CONSTRAINT departments_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE business_processes
  ADD CONSTRAINT business_processes_tenant_id_id_unique UNIQUE (tenant_id, id),
  ADD CONSTRAINT business_processes_tenant_department_fk
    FOREIGN KEY (tenant_id, department_id)
    REFERENCES departments (tenant_id, id);

ALTER TABLE automation_opportunities
  ADD CONSTRAINT automation_opportunities_tenant_department_fk
    FOREIGN KEY (tenant_id, department_id)
    REFERENCES departments (tenant_id, id),
  ADD CONSTRAINT automation_opportunities_tenant_process_fk
    FOREIGN KEY (tenant_id, process_id)
    REFERENCES business_processes (tenant_id, id);

CREATE INDEX business_processes_tenant_department_idx
  ON business_processes (tenant_id, department_id);

CREATE INDEX automation_opportunities_tenant_department_idx
  ON automation_opportunities (tenant_id, department_id);

CREATE INDEX automation_opportunities_tenant_process_idx
  ON automation_opportunities (tenant_id, process_id);
