import { describe, expect, it, vi } from "vitest";
import { organizationAdminPermissions, provisionOrganization } from "./organization-provisioning.js";
import type { PoolClient } from "pg";

function mockClient(operatorExists = true) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.startsWith("SELECT id FROM cias_platform_operators")) {
      return { rows: operatorExists ? [{ id: "operator-id" }] : [], rowCount: operatorExists ? 1 : 0 } as never;
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
    expect(statements.some((sql) => sql.startsWith("INSERT INTO tenants"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("INSERT INTO tenant_memberships"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("INSERT INTO audit_events"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(result).toEqual({
      organization: { id: "tenant-id", name: "Acme", status: "active" },
      initialAdministrator: { subject: "organization-admin-1", role: "organization_admin" }
    });
    const membershipCall = calls.find(([sql]) => sql.startsWith("INSERT INTO tenant_memberships"));
    expect(membershipCall?.[1]?.[3]).toEqual([...organizationAdminPermissions]);
    expect(organizationAdminPermissions).not.toContain("business_process_models:publish");
    expect(organizationAdminPermissions).not.toContain("opportunities:approve");
  });

  it("refuses non-allowlisted operators and rolls back before tenant creation", async () => {
    const client = mockClient(false);
    await expect(provisionOrganization(client, input)).rejects.toThrow("not an active CIAS platform operator");
    const calls = client.query.mock.calls as unknown as [string, unknown[]?][];
    expect(calls).toEqual([
      ["BEGIN", undefined],
      [
        "SELECT id FROM cias_platform_operators WHERE issuer = $1 AND subject = $2 AND status = 'active' FOR SHARE",
        [input.issuer, input.operatorSubject]
      ],
      ["ROLLBACK", undefined]
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
