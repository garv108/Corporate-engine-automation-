import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import {
  postgresBusinessProcessRepository,
  type BusinessProcess
} from "./business-processes.js";

const tenantA = randomUUID();
const tenantB = randomUUID();
const departmentA = randomUUID();
const departmentB = randomUUID();
const processA = randomUUID();
const processB = randomUUID();
const actorId = "integration-test-actor";

async function insertProcess(
  id: string,
  tenantId: string,
  departmentId: string | null,
  name: string
): Promise<void> {
  await pool.query(
    `INSERT INTO business_processes
      (id, tenant_id, department_id, name, description, systems, inputs, outputs, sensitivity)
     VALUES ($1, $2, $3, $4, NULL, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'unknown')`,
    [id, tenantId, departmentId, name]
  );
}

describe("Business Processes PostgreSQL tenant isolation", () => {
  beforeAll(async () => {
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, 'Integration tenant A'), ($2, 'Integration tenant B')", [
      tenantA,
      tenantB
    ]);
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
    const rows = await postgresBusinessProcessRepository.list(tenantA);
    expect(rows.map((row: BusinessProcess) => row.id)).toContain(processA);
    expect(rows.map((row: BusinessProcess) => row.id)).not.toContain(processB);
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
      postgresBusinessProcessRepository.create(tenantA, actorId, {
        name: "Invalid association",
        departmentId: departmentB
      })
    ).rejects.toMatchObject({ code: "23503" });

    const result = await pool.query(
      "SELECT id FROM business_processes WHERE tenant_id = $1 AND name = 'Invalid association'",
      [tenantA]
    );
    expect(result.rowCount).toBe(0);
  });

  it("writes the process and its audit event in one successful operation", async () => {
    const created = await postgresBusinessProcessRepository.create(tenantA, actorId, {
      name: "Audited process",
      departmentId: departmentA,
      systems: ["ERP"],
      inputs: ["Invoice"],
      outputs: ["Payment instruction"]
    });

    expect(created.tenantId).toBe(tenantA);
    expect(created.departmentId).toBe(departmentA);

    const audit = await pool.query(
      "SELECT action, actor_id FROM audit_events WHERE tenant_id = $1 AND resource_id = $2",
      [tenantA, created.id]
    );
    expect(audit.rows).toEqual([{ action: "business_process.created", actor_id: actorId }]);
  });
});
