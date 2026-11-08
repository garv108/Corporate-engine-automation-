# Workforce Intelligence MVP — M3-A

## Scope
This increment establishes tenant-scoped workforce records: employee directory, skill profiles, and operational tasks. It builds on the existing tenant, department, membership, and audit foundations.

## Domain decisions
- Employee profiles are not login accounts. A workforce record can exist before an employee receives CIAS access.
- Every employee, skill, task, and task-skill relationship is tenant-scoped. Composite foreign keys prevent cross-tenant associations at the database boundary.
- Department and manager references are optional; when present, they must belong to the same tenant.
- Skills use a 1–5 proficiency scale. New employee skill records are always self-reported; clients cannot self-assign manager/evidence verification.
- Tasks may have an assignee, department, due date, priority, and required skills. Assignment remains explicitly human-managed in this increment.
- Mutations are attributable to the authenticated principal and recorded in the audit log.

## Authorization
The API expects existing OIDC authentication and tenant membership resolution. It does not add public organization signup, self-service membership provisioning, or a bypass around the trusted membership bootstrap policy. Permissions: workforce:employees:read, workforce:employees:create, workforce:skills:record, workforce:tasks:read, workforce:tasks:create, workforce:tasks:update.

## API surface
GET/POST /api/v1/workforce/employees
GET/POST /api/v1/workforce/employees/:employeeId/skills
GET/POST /api/v1/workforce/tasks
PATCH /api/v1/workforce/tasks/:taskId

Lists are bounded to 200 records in this first increment; cursor pagination and filters are follow-up work.

## Explicitly deferred
Conversational onboarding, identity invitations, manager verification workflow, evidence review UI, AI assignment recommendations, workload-aware ranking, notifications, and full task board UI. Assignment recommendations must remain advisory and require a human acceptance action before any assignee changes.

## Local verification
Run pnpm db:migrate, pnpm typecheck, pnpm test, and pnpm build in Codespaces before considering this increment ready for review. Use synthetic tenant data only.
