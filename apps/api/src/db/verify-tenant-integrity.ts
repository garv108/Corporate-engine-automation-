import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });

async function expectForeignKeyViolation(
  client: pg.PoolClient,
  savepoint: string,
  operation: () => Promise<unknown>
): Promise<void> {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await operation();
    throw new Error(`Expected tenant-integrity constraint to reject ${savepoint}`);
  } catch (error) {
    if ((error as { code?: string }).code !== "23503") {
      throw error;
    }
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
}

async function verifyTenantConstraints(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenantA = (await client.query<{ id: string }>(
      "INSERT INTO tenants (name) VALUES ('__cias_integrity_a__') RETURNING id"
    )).rows[0]!.id;
    const tenantB = (await client.query<{ id: string }>(
      "INSERT INTO tenants (name) VALUES ('__cias_integrity_b__') RETURNING id"
    )).rows[0]!.id;

    const departmentA = (await client.query<{ id: string }>(
      "INSERT INTO departments (tenant_id, name) VALUES ($1, '__cias_integrity_department_a__') RETURNING id",
      [tenantA]
    )).rows[0]!.id;
    const departmentB = (await client.query<{ id: string }>(
      "INSERT INTO departments (tenant_id, name) VALUES ($1, '__cias_integrity_department_b__') RETURNING id",
      [tenantB]
    )).rows[0]!.id;

    const processA = (await client.query<{ id: string }>(
      "INSERT INTO business_processes (tenant_id, department_id, name) VALUES ($1, $2, '__cias_integrity_process_a__') RETURNING id",
      [tenantA, departmentA]
    )).rows[0]!.id;
    const processB = (await client.query<{ id: string }>(
      "INSERT INTO business_processes (tenant_id, department_id, name) VALUES ($1, $2, '__cias_integrity_process_b__') RETURNING id",
      [tenantB, departmentB]
    )).rows[0]!.id;

    await expectForeignKeyViolation(client, "cross_tenant_process_department", () =>
      client.query(
        "INSERT INTO business_processes (tenant_id, department_id, name) VALUES ($1, $2, '__cias_invalid_process__')",
        [tenantA, departmentB]
      )
    );

    await expectForeignKeyViolation(client, "cross_tenant_opportunity_department", () =>
      client.query(
        "INSERT INTO automation_opportunities (tenant_id, department_id, process_id, title, problem_statement) VALUES ($1, $2, $3, '__cias_invalid_opportunity__', 'integrity test')",
        [tenantA, departmentB, processA]
      )
    );

    await expectForeignKeyViolation(client, "cross_tenant_opportunity_process", () =>
      client.query(
        "INSERT INTO automation_opportunities (tenant_id, department_id, process_id, title, problem_statement) VALUES ($1, $2, $3, '__cias_invalid_opportunity__', 'integrity test')",
        [tenantA, departmentA, processB]
      )
    );

    await client.query("ROLLBACK");
    console.info("Tenant integrity checks passed (3 cross-tenant writes rejected).");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  await verifyTenantConstraints();
} finally {
  await pool.end();
}
