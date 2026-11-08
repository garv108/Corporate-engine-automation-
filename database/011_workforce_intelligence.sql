-- M3-A: tenant-scoped workforce directory, skill profiles and human-managed tasks.
-- Employee profiles are distinct from login identities: many employees will not have CIAS accounts.
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_code TEXT, full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 160),
  work_email TEXT, department_id UUID, manager_employee_id UUID,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','inactive','on_leave')),
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employees_tenant_id_id_unique UNIQUE (tenant_id,id),
  CONSTRAINT employees_tenant_code_unique UNIQUE (tenant_id,employee_code),
  CONSTRAINT employees_tenant_department_fk FOREIGN KEY (tenant_id,department_id) REFERENCES departments(tenant_id,id),
  CONSTRAINT employees_tenant_manager_fk FOREIGN KEY (tenant_id,manager_employee_id) REFERENCES employees(tenant_id,id),
  CONSTRAINT employees_manager_not_self CHECK (manager_employee_id IS NULL OR manager_employee_id <> id)
);
CREATE INDEX employees_tenant_department_status_idx ON employees(tenant_id,department_id,employment_status);
CREATE INDEX employees_tenant_manager_idx ON employees(tenant_id,manager_employee_id);
CREATE TABLE workforce_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120), description TEXT, category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workforce_skills_tenant_id_id_unique UNIQUE (tenant_id,id),
  CONSTRAINT workforce_skills_tenant_name_unique UNIQUE (tenant_id,name)
);
CREATE TABLE employee_skills (
  tenant_id UUID NOT NULL, employee_id UUID NOT NULL, skill_id UUID NOT NULL,
  proficiency SMALLINT NOT NULL CHECK (proficiency BETWEEN 1 AND 5),
  verification_status TEXT NOT NULL DEFAULT 'self_reported'
    CHECK (verification_status IN ('self_reported','manager_verified','evidence_verified','disputed')),
  evidence_reference TEXT, evidence_notes TEXT, recorded_by TEXT NOT NULL,
  verified_by TEXT, verified_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,employee_id,skill_id),
  CONSTRAINT employee_skills_employee_fk FOREIGN KEY (tenant_id,employee_id) REFERENCES employees(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT employee_skills_skill_fk FOREIGN KEY (tenant_id,skill_id) REFERENCES workforce_skills(tenant_id,id),
  CONSTRAINT employee_skills_verification_consistency CHECK (
    (verification_status IN ('manager_verified','evidence_verified') AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    OR (verification_status IN ('self_reported','disputed') AND verified_by IS NULL AND verified_at IS NULL)
  )
);
CREATE INDEX employee_skills_tenant_skill_proficiency_idx ON employee_skills(tenant_id,skill_id,proficiency,verification_status);
CREATE TABLE workforce_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id),
  department_id UUID, title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200), description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('backlog','todo','in_progress','blocked','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_employee_id UUID, due_at TIMESTAMPTZ, created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workforce_tasks_tenant_id_id_unique UNIQUE (tenant_id,id),
  CONSTRAINT workforce_tasks_department_fk FOREIGN KEY (tenant_id,department_id) REFERENCES departments(tenant_id,id),
  CONSTRAINT workforce_tasks_assignee_fk FOREIGN KEY (tenant_id,assignee_employee_id) REFERENCES employees(tenant_id,id)
);
CREATE INDEX workforce_tasks_tenant_status_due_idx ON workforce_tasks(tenant_id,status,due_at,created_at DESC);
CREATE INDEX workforce_tasks_tenant_assignee_status_idx ON workforce_tasks(tenant_id,assignee_employee_id,status);
CREATE TABLE workforce_task_required_skills (
  tenant_id UUID NOT NULL, task_id UUID NOT NULL, skill_id UUID NOT NULL,
  minimum_proficiency SMALLINT NOT NULL DEFAULT 1 CHECK (minimum_proficiency BETWEEN 1 AND 5),
  PRIMARY KEY (tenant_id,task_id,skill_id),
  FOREIGN KEY (tenant_id,task_id) REFERENCES workforce_tasks(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,skill_id) REFERENCES workforce_skills(tenant_id,id)
);
CREATE OR REPLACE FUNCTION cias_set_workforce_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION cias_set_workforce_updated_at();
CREATE TRIGGER workforce_tasks_updated_at BEFORE UPDATE ON workforce_tasks FOR EACH ROW EXECUTE FUNCTION cias_set_workforce_updated_at();
CREATE TRIGGER employee_skills_updated_at BEFORE UPDATE ON employee_skills FOR EACH ROW EXECUTE FUNCTION cias_set_workforce_updated_at();
