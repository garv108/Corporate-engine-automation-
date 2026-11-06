import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import { postgresAutomationOpportunityRepository } from "./opportunities.js";

const tenantA = randomUUID();
const tenantB = randomUUID();
const departmentA = randomUUID();
const departmentB = randomUUID();
const processA = randomUUID();
const processB = randomUUID();
const opportunityA = randomUUID();
const opportunityB = randomUUID();
const actorId = "opportunity-integration-actor";

async function insertOpportunity(id: string, tenantId: string, processId: string, title: string): Promise<void> {
  await pool.query(
    `INSERT INTO automation_opportunities
      (id, tenant_id, process_id, title, problem_statement, status)
     VALUES ($1, $2, $3, $4, 'Integration fixture problem statement', 'discovered')`,
    [id, tenantId, processId, title]
  );
}

describe("Automation Opportunities PostgreSQL tenant isolation", () => {
  beforeAll(async () => {
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, 'Opportunity tenant A'), ($2, 'Opportunity tenant B')", [
      tenantA,
      tenantB
    ]);
    await pool.query(
      "INSERT INTO departments (id, tenant_id, name) VALUES ($1, $2, 'Operations'), ($3, $4, 'Finance')",
      [departmentA, tenantA, departmentB, tenantB]
    );
    await pool.query(
      "INSERT INTO business_processes (id, tenant_id, department_id, name) VALUES ($1, $2, $3, 'Tenant A process'), ($4, $5, $6, 'Tenant B process')",
      [processA, tenantA, departmentA, processB, tenantB, departmentB]
    );
    await insertOpportunity(opportunityA, tenantA, processA, "Tenant A opportunity");
    await insertOpportunity(opportunityB, tenantB, processB, "Tenant B opportunity");
  }, 15_000);

  afterAll(async () => {
    await pool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM automation_opportunities WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM business_processes WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM departments WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  }, 15_000);

  it("lists only opportunities belonging to the requested tenant", async () => {
    const rows = await postgresAutomationOpportunityRepository.list(tenantA);
    expect(rows.map((row) => row.id)).toContain(opportunityA);
    expect(rows.map((row) => row.id)).not.toContain(opportunityB);
  });

  it("does not reveal another tenant's opportunity by ID", async () => {
    await expect(postgresAutomationOpportunityRepository.get(tenantA, opportunityB)).resolves.toBeNull();
  });

  it("does not update another tenant's opportunity by ID", async () => {
    await expect(
      postgresAutomationOpportunityRepository.update(tenantA, opportunityB, actorId, { title: "Attempted takeover" })
    ).resolves.toBeNull();

    const result = await pool.query("SELECT title FROM automation_opportunities WHERE id = $1", [opportunityB]);
    expect(result.rows[0]?.title).toBe("Tenant B opportunity");
  });

  it("rejects cross-tenant department and process associations", async () => {
    await expect(
      postgresAutomationOpportunityRepository.create(tenantA, actorId, {
        title: "Invalid process reference",
        problemStatement: "This reference belongs to another tenant",
        processId: processB
      })
    ).rejects.toMatchObject({ code: "23503" });

    await expect(
      postgresAutomationOpportunityRepository.create(tenantA, actorId, {
        title: "Invalid department reference",
        problemStatement: "This reference belongs to another tenant",
        departmentId: departmentB
      })
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("persists scores and an audit event for a valid opportunity", async () => {
    const created = await postgresAutomationOpportunityRepository.create(tenantA, actorId, {
      title: "Audited opportunity",
      problemStatement: "Manual reconciliation is repetitive",
      processId: processA,
      impactScore: 82,
      confidence: 0.91,
      impactEstimate: { hoursSavedPerMonth: 24 },
      evidenceRefs: ["source-1"]
    });

    expect(created.tenantId).toBe(tenantA);
    expect(created.processId).toBe(processA);
    expect(created.impactScore).toBe(82);
    expect(created.confidence).toBe(0.91);

    const audit = await pool.query(
      "SELECT action, actor_id FROM audit_events WHERE tenant_id = $1 AND resource_id = $2",
      [tenantA, created.id]
    );
    expect(audit.rows).toEqual([{ action: "automation_opportunity.created", actor_id: actorId }]);
  });
});
