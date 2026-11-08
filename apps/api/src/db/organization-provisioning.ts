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
  name: string;
  issuer: string;
  operatorSubject: string;
  adminSubject: string;
};

export type ProvisionOrganizationResult = {
  organization: { id: string; name: string; status: string };
  initialAdministrator: { subject: string; role: "organization_admin" };
};

export async function provisionOrganization(
  client: Pick<PoolClient, "query">,
  input: ProvisionOrganizationInput
): Promise<ProvisionOrganizationResult> {
  await client.query("BEGIN");
  try {
    const operator = await client.query(
      "SELECT id FROM cias_platform_operators WHERE issuer = $1 AND subject = $2 AND status = 'active' FOR SHARE",
      [input.issuer, input.operatorSubject]
    );
    if (!operator.rows[0]) {
      throw new Error("Caller is not an active CIAS platform operator");
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
      "INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, resource_type, resource_id, decision, metadata) " +
      "VALUES ($1, 'platform_operator', $2, 'organization.provisioned', 'tenant', $1::text, 'allowed', $3::jsonb)",
      [tenantId, input.operatorSubject, JSON.stringify({
        organizationName: input.name,
        initialAdministratorMembershipId: membershipId,
        initialRole: "organization_admin",
        permissionProfile: "organization_admin_m3b_v1"
      })]
    );
    await client.query("COMMIT");

    return {
      organization: { id: tenantId, name: tenant.rows[0]!.name, status: tenant.rows[0]!.status },
      initialAdministrator: { subject: input.adminSubject, role: "organization_admin" }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
