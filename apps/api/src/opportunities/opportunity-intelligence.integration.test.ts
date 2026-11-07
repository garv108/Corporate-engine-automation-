import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db/pool.js";
import {
  AssessmentEvidenceError,
  calculateInterventionScore,
  postgresOpportunityIntelligenceRepository as repository
} from "./opportunity-intelligence.js";

const tenantA = randomUUID();
const tenantB = randomUUID();
const opportunityA = randomUUID();
const opportunityB = randomUUID();
const actorId = "opportunity-assessment-integration-actor";
const dimensions = {
  expectedImpact: { score: 4, rationale: "Removes a repeated manual handling step." },
  feasibility: { score: 4, rationale: "Required application interfaces are available." },
  implementationEffort: { score: 2, rationale: "A small integration and review flow are sufficient." },
  operationalRisk: { score: 2, rationale: "A human checkpoint remains for exceptions." },
  evidenceStrength: { score: 3, rationale: "A sample of recent cases was reviewed." }
};

describe("Opportunity evidence, intervention and assessment persistence", () => {
  beforeAll(async () => {
    await pool.query("INSERT INTO tenants (id,name) VALUES ($1,'Assessment tenant A'),($2,'Assessment tenant B')", [tenantA, tenantB]);
    await pool.query(
      "INSERT INTO automation_opportunities (id,tenant_id,title,problem_statement,status) VALUES ($1,$2,'Invoice re-entry','Repeated invoice data entry','qualified'),($3,$4,'Support backlog','Manual triage delays requests','qualified')",
      [opportunityA, tenantA, opportunityB, tenantB]
    );
  }, 15_000);

  afterAll(async () => {
    await pool.query("DELETE FROM audit_events WHERE tenant_id=ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM automation_opportunities WHERE tenant_id=ANY($1::uuid[])", [[tenantA, tenantB]]);
    await pool.query("DELETE FROM tenants WHERE id=ANY($1::uuid[])", [[tenantA, tenantB]]);
  }, 15_000);

  it("persists evidence, intervention and immutable evidence-linked assessment versions", async () => {
    const evidence = await repository.createEvidence(tenantA, opportunityA, actorId, {
      sourceKind: "direct_observation",
      claim: "An operator enters invoice details into two separate systems.",
      sourceLabel: "Operations walkthrough",
      classification: "internal"
    });
    const intervention = await repository.createIntervention(tenantA, opportunityA, actorId, {
      interventionType: "process_redesign",
      title: "Capture invoice once",
      description: "Use one intake record and route it to both existing review stages.",
      assumptions: ["Both teams accept the same required fields"],
      dependencies: ["Agree a shared intake form"],
      limitations: ["Existing approval logic remains unchanged"],
      humanCheckpoints: ["Finance reviewer approves exceptions"]
    });

    const first = await repository.createAssessment(tenantA, opportunityA, intervention.id, actorId, {
      dimensionScores: dimensions,
      rationale: "This is the strongest current option based on the available observation.",
      assumptions: ["The two systems can consume a shared record"],
      expectedImpact: { lowerBound: 4, upperBound: 8, unit: "hours", period: "per month" },
      evidenceIds: [evidence.id]
    });
    const second = await repository.createAssessment(tenantA, opportunityA, intervention.id, actorId, {
      dimensionScores: { ...dimensions, feasibility: { score: 3, rationale: "Integration feasibility needs a technical spike." } },
      rationale: "The feasibility rating was revised after a technical review.",
      assumptions: ["A technical spike is still required"],
      expectedImpact: {},
      evidenceIds: [evidence.id]
    });

    expect(first?.version).toBe(1);
    expect(first?.overallScore).toBe(calculateInterventionScore(dimensions));
    expect(first?.scoringMethodVersion).toBe("CIAS-INTERVENTION-V1");
    expect(second?.version).toBe(2);
    const assessments = await repository.listAssessments(tenantA, opportunityA, intervention.id);
    expect(assessments).toHaveLength(2);
    expect(assessments?.[0]?.evidenceIds).toContain(evidence.id);

    await expect(pool.query(
      "UPDATE opportunity_intervention_assessments SET rationale='tampered' WHERE tenant_id=$1 AND id=$2",
      [tenantA, first!.id]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(pool.query(
      "UPDATE opportunity_evidence SET claim='tampered' WHERE tenant_id=$1 AND id=$2",
      [tenantA, evidence.id]
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("rejects cross-tenant evidence links and prevents multiple selected candidates", async () => {
    const evidenceB = await repository.createEvidence(tenantB, opportunityB, actorId, {
      sourceKind: "user_statement",
      claim: "Support agents repeat the same case details.",
      sourceLabel: "Support team interview"
    });
    const interventionA = await repository.createIntervention(tenantA, opportunityA, actorId, {
      interventionType: "automation",
      title: "Automate invoice handoff",
      description: "Transfer validated invoice fields into the finance review queue."
    });
    await expect(repository.createAssessment(tenantA, opportunityA, interventionA.id, actorId, {
      dimensionScores: dimensions,
      rationale: "This assessment attempts to use evidence from another tenant.",
      assumptions: [],
      expectedImpact: {},
      evidenceIds: [evidenceB.id]
    })).rejects.toBeInstanceOf(AssessmentEvidenceError);

    const interventionB = await repository.createIntervention(tenantA, opportunityA, actorId, {
      interventionType: "training",
      title: "Train intake staff",
      description: "Train intake staff to validate the invoice fields before submission."
    });
    await repository.updateIntervention(tenantA, opportunityA, interventionA.id, actorId, "shortlisted");
    await repository.updateIntervention(tenantA, opportunityA, interventionA.id, actorId, "selected");
    await repository.updateIntervention(tenantA, opportunityA, interventionB.id, actorId, "shortlisted");
    await expect(
      repository.updateIntervention(tenantA, opportunityA, interventionB.id, actorId, "selected")
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("keeps opportunity, evidence and intervention queries tenant-scoped", async () => {
    const evidence = await repository.listEvidence(tenantA, opportunityA);
    const wrongTenant = await repository.listEvidence(tenantB, opportunityA);
    const interventions = await repository.listInterventions(tenantA, opportunityA);
    expect(evidence?.every((item) => item.tenantId === tenantA)).toBe(true);
    expect(wrongTenant).toBeNull();
    expect(interventions?.every((item) => item.tenantId === tenantA)).toBe(true);
  });
});
