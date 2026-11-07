import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { postgresBusinessProcessRepository, type BusinessProcess } from "./business-processes.js";

const tenantA = randomUUID();
const tenantB = randomUUID();
const departmentA = randomUUID();
const departmentB = randomUUID();
const processA = randomUUID();
const processB = randomUUID();
const actorId = "integration-test-actor";

async function insertProcess(id: string, tenantId: string, departmentId: string | null, name: string): Promise<void> {
  await pool.query(
    `INSERT INTO business_processes
      (id, tenant_id, department_id, name, description, systems, inputs, outputs, sensitivity)
     VALUES ($1, $2, $3, $4, NULL, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'unknown')`,
    [id, tenantId, departmentId, name]
  );
}

describe("Business Processes PostgreSQL tenant isolation", () => {
  beforeAll(async () => {
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, 'Integration tenant A'), ($2, 'Integration tenant B')", [tenantA, tenantB]);
    await pool.query(
      "INSERT INTO departments (id, tenant_id, name) VALUES ($1, $2, 'Operations'), ($3, $4, 'Finance')",
      [departmentA, tenantA, departmentB, tenantB]
    );
    await insertProcess(processA, tenantA, departmentA, "Tenant A process");
    await insertProcess(processB, tenantB, departmentB, "Tenant B process");
  }, 15_000);

  afterAll(async () => {
    await pool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM business_processes WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM departments WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  }, 15_000);

  it("lists only records belonging to the requested tenant", async () => {
    const page = await postgresBusinessProcessRepository.list(tenantA, { limit: 50, after: null });
    expect(page.items.map((row: BusinessProcess) => row.id)).toContain(processA);
    expect(page.items.map((row: BusinessProcess) => row.id)).not.toContain(processB);
  });

  it("uses stable keyset pagination, including the ID tie-breaker for equal names", async () => {
    await insertProcess(randomUUID(), tenantA, departmentA, "Same process name");
    await insertProcess(randomUUID(), tenantA, departmentA, "Same process name");
    const firstPage = await postgresBusinessProcessRepository.list(tenantA, { limit: 1, after: null });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.hasMore).toBe(true);
    const firstItem = firstPage.items[0]!;
    const secondPage = await postgresBusinessProcessRepository.list(tenantA, {
      limit: 1, after: { name: firstItem.name, id: firstItem.id }
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstItem.id);
  });

  it("does not reveal another tenant's process by ID", async () => {
    await expect(postgresBusinessProcessRepository.get(tenantA, processB)).resolves.toBeNull();
  });

  it("does not update another tenant's process by ID", async () => {
    await expect(
      postgresBusinessProcessRepository.update(tenantA, processB, actorId, { name: "Attempted takeover" })
    ).resolves.toBeNull();
    const result = await pool.query("SELECT name FROM business_processes WHERE id = $1", [processB]);
    expect(result.rows[0]?.name).toBe("Tenant B process");
  });

  it("rejects a cross-tenant department association at the database boundary", async () => {
    await expect(
      postgresBusinessProcessRepository.create(tenantA, actorId, { name: "Invalid association", departmentId: departmentB })
    ).rejects.toMatchObject({ code: "23503" });
    const result = await pool.query(
      "SELECT id FROM business_processes WHERE tenant_id = $1 AND name = 'Invalid association'", [tenantA]
    );
    expect(result.rowCount).toBe(0);
  });

  it("rejects a non-standard sensitivity value at the database boundary", async () => {
    await expect(pool.query(
      `INSERT INTO business_processes (tenant_id, name, sensitivity)
       VALUES ($1, 'Invalid classification', 'top-secret-free-text')`,
      [tenantA]
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("rolls back process writes when the audit insert fails", async () => {
    const suffix = randomUUID().replace(/-/g, "");
    const functionName = "fail_business_process_audit_" + suffix;
    const triggerName = "fail_business_process_audit_trigger_" + suffix;
    await pool.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced audit failure';
      END;
    $$`);
    await pool.query(`CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON audit_events FOR EACH ROW
      WHEN (NEW.resource_type = 'business_process')
      EXECUTE FUNCTION ${functionName}()`);
    try {
      await expect(
        postgresBusinessProcessRepository.create(tenantA, actorId, { name: "Must roll back" })
      ).rejects.toThrow();
      const created = await pool.query(
        "SELECT id FROM business_processes WHERE tenant_id = $1 AND name = 'Must roll back'", [tenantA]
      );
      expect(created.rowCount).toBe(0);

      await expect(
        postgresBusinessProcessRepository.update(tenantA, processA, actorId, { name: "Must not persist" })
      ).rejects.toThrow();
      const unchanged = await pool.query("SELECT name FROM business_processes WHERE id = $1", [processA]);
      expect(unchanged.rows[0]?.name).toBe("Tenant A process");
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON audit_events`);
      await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
  });
});
