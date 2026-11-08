import type { PoolClient } from "pg";

export const organizationAdminPermissions = [
  "departments:read", "departments:create", "departments:update",
  "business_processes:read", "business_processes:create", "business_processes:update",
  "business_process_models:read", "business_process_models:create",
  "business_process_models:update", "business_process_models:confirm",
  "business_process_models:review_facts",
  "process_discovery_sessions:read", "process_discovery_sessions:create",
  "process_discovery_sessions:update", "process_discovery_sessions:confirm",
  "process_discovery_sessions:convert",
  "opportunities:read", "opportunities:create", "opportunities:update",
  "opportunities:evidence:create", "opportunities:interventions:create",
  "opportunities:interventions:update", "opportunities:assess",
  "workforce:employees:read", "workforce:employees:create",
  "workforce:skills:record", "workforce:tasks:read",
  "workforce:tasks:create", "workforce:tasks:update"
] as const;

export type ProvisionOrganizationInput = {
  requestId: string;
  name: string;
  issuer: string;
  operatorSubject: string;
  adminSubject: string;
};

export type ProvisionOrganizationResult = {
  organization: { id: string; name: string; status: string };
  initialAdministrator: { subject: string; role: "organization_admin" };
  replayed: boolean;
};

export async function provisionOrganization(
  client: Pick<PoolClient, "query">,
  input: ProvisionOrganizationInput
): Promise<ProvisionOrganizationResult> {
  await client.query("BEGIN");
  try {
    // Serialize retries for this request key, including concurrent invocations.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [input.requestId]);

    const operator = await client.query(
      "SELECT id FROM cias_platform_operators WHERE issuer = $1 AND subject = $2 AND status = 'active' FOR SHARE",
      [input.issuer, input.operatorSubject]
    );
    if (!operator.rows[0]) {
      throw new Error("Caller is not an active CIAS platform operator");
    }

    const previous = await client.query<{
      tenantId: string; name: string; status: string; issuer: string;
      adminSubject: string; operatorSubject: string;
    }>(
      "SELECT request.tenant_id AS \"tenantId\", tenant.name, tenant.status, request.issuer, " +
      "request.admin_subject AS \"adminSubject\", request.operator_subject AS \"operatorSubject\" " +
      "FROM cias_organization_provisioning_requests AS request " +
      "JOIN tenants AS tenant ON tenant.id = request.tenant_id WHERE request.request_id = $1",
      [input.requestId]
    );
    if (previous.rows[0]) {
      const existing = previous.rows[0];
      if (
        existing.name !== input.name || existing.issuer !== input.issuer ||
        existing.adminSubject !== input.adminSubject || existing.operatorSubject !== input.operatorSubject
      ) {
        throw new Error("Provisioning request ID was already used with different organization details");
      }
      await client.query("COMMIT");
      return {
        organization: { id: existing.tenantId, name: existing.name, status: existing.status },
        initialAdministrator: { subject: existing.adminSubject, role: "organization_admin" },
        replayed: true
      };
    }

    const tenant = await client.query<{ id: string; name: string; status: string }>(
      "INSERT INTO tenants (name, status) VALUES ($1, 'active') RETURNING id, name, status",
      [input.name]
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error("Tenant provisioning did not return an organization ID");

    const membership = await client.query<{ id: string }>(
      "INSERT INTO tenant_memberships (tenant_id, issuer, subject, status, roles, permissions) " +
      "VALUES ($1, $2, $3, 'active', ARRAY['organization_admin']::text[], $4::text[]) " +
      "RETURNING id",
      [tenantId, input.issuer, input.adminSubject, [...organizationAdminPermissions]]
    );
    const membershipId = membership.rows[0]?.id;
    if (!membershipId) throw new Error("Initial administrator membership was not created");

    await client.query(
      "INSERT INTO cias_organization_provisioning_requests " +
      "(request_id, tenant_id, organization_name, issuer, admin_subject, operator_subject) " +
      "VALUES ($1, $2, $3, $4, $5, $6)",
      [input.requestId, tenantId, input.name, input.issuer, input.adminSubject, input.operatorSubject]
    );

    await client.query(
      "INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata) " +
      "VALUES ($1, 'platform_operator', $2, 'organization.provisioned', 'tenant', $1::text, 'allowed', $3::jsonb)",
      [tenantId, input.operatorSubject, JSON.stringify({
        requestId: input.requestId,
        organizationName: input.name,
        initialAdministratorMembershipId: membershipId,
        initialRole: "organization_admin",
        permissionProfile: "organization_admin_m3b_v1"
      })]
    );
    await client.query("COMMIT");

    return {
      organization: { id: tenantId, name: tenant.rows[0]!.name, status: tenant.rows[0]!.status },
      initialAdministrator: { subject: input.adminSubject, role: "organization_admin" },
      replayed: false
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
