import { describe, expect, it, vi } from "vitest";
import { organizationAdminPermissions, provisionOrganization } from "./organization-provisioning.js";
import type { PoolClient } from "pg";

const prior = {
  tenantId: "tenant-id", name: "Acme", status: "active",
  issuer: "https://identity.example.test", adminSubject: "organization-admin-1",
  operatorSubject: "platform-operator-1"
};

function mockClient(operatorExists = true, previousRequest: typeof prior | null = null) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.startsWith("SELECT id FROM cias_platform_operators")) {
      return { rows: operatorExists ? [{ id: "operator-id" }] : [], rowCount: operatorExists ? 1 : 0 } as never;
    }
    if (sql.startsWith("SELECT request.tenant_id")) {
      return { rows: previousRequest ? [previousRequest] : [], rowCount: previousRequest ? 1 : 0 } as never;
    }
    if (sql.startsWith("INSERT INTO tenants")) {
      return { rows: [{ id: "tenant-id", name: "Acme", status: "active" }], rowCount: 1 } as never;
    }
    if (sql.startsWith("INSERT INTO tenant_memberships")) {
      return { rows: [{ id: "membership-id" }], rowCount: 1 } as never;
    }
    return { rows: [], rowCount: 1 } as never;
  });
  return { query } as unknown as PoolClient & { query: typeof query };
}

const input = {
  requestId: "22222222-2222-4222-8222-222222222222",
  name: "Acme",
  issuer: "https://identity.example.test",
  operatorSubject: "platform-operator-1",
  adminSubject: "organization-admin-1"
};

describe("controlled organization provisioning", () => {
  it("creates the tenant and first administrator in one audited transaction", async () => {
    const client = mockClient();
    const result = await provisionOrganization(client, input);
    const calls = client.query.mock.calls as unknown as [string, unknown[]?][];
    const statements = calls.map(([sql]) => sql);

    expect(statements[0]).toBe("BEGIN");
    expect(statements).toContain("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))");
    expect(statements.some((sql) => sql.startsWith("INSERT INTO tenants"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("INSERT INTO tenant_memberships"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("INSERT INTO cias_organization_provisioning_requests"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("INSERT INTO audit_events"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(result).toEqual({
      organization: { id: "tenant-id", name: "Acme", status: "active" },
      initialAdministrator: { subject: "organization-admin-1", role: "organization_admin" },
      replayed: false
    });
    const membershipCall = calls.find(([sql]) => sql.startsWith("INSERT INTO tenant_memberships"));
    expect(membershipCall?.[1]?.[3]).toEqual([...organizationAdminPermissions]);
    expect(organizationAdminPermissions).not.toContain("business_process_models:publish");
    expect(organizationAdminPermissions).not.toContain("opportunities:approve");
  });

  it("returns the existing organization when the same request is retried", async () => {
    const client = mockClient(true, prior);
    const result = await provisionOrganization(client, input);
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(result).toEqual({
      organization: { id: "tenant-id", name: "Acme", status: "active" },
      initialAdministrator: { subject: "organization-admin-1", role: "organization_admin" },
      replayed: true
    });
    expect(statements.some((sql) => sql.startsWith("INSERT INTO tenants"))).toBe(false);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("rejects reuse of a request ID with different organization details", async () => {
    const client = mockClient(true, prior);
    await expect(provisionOrganization(client, { ...input, name: "Different organization" }))
      .rejects.toThrow("already used with different organization details");
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("refuses non-allowlisted operators and rolls back before tenant creation", async () => {
    const client = mockClient(false);
    await expect(provisionOrganization(client, input)).rejects.toThrow("not an active CIAS platform operator");
    const calls = client.query.mock.calls as unknown as [string, unknown[]?][];
    expect(calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      "SELECT id FROM cias_platform_operators WHERE issuer = $1 AND subject = $2 AND status = 'active' FOR SHARE",
      "ROLLBACK"
    ]);
  });

  it("rolls back tenant creation if the initial administrator membership fails", async () => {
    const client = mockClient();
    client.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("INSERT INTO tenant_memberships")) throw new Error("membership insert failed");
      if (sql.startsWith("SELECT id FROM cias_platform_operators")) return { rows: [{ id: "operator-id" }] } as never;
      if (sql.startsWith("INSERT INTO tenants")) return { rows: [{ id: "tenant-id", name: "Acme", status: "active" }] } as never;
      return { rows: [], rowCount: 1 } as never;
    });
    await expect(provisionOrganization(client, input)).rejects.toThrow("membership insert failed");
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});
