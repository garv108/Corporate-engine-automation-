import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal, IdentityVerifier } from "../auth/auth.js";
import { createApp } from "../app.js";
import {
  calculateInterventionScore,
  type OpportunityIntelligenceRepository
} from "./opportunity-intelligence.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "22222222-2222-4222-8222-222222222222";
const interventionId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";
const principal: AuthenticatedPrincipal = {
  subject: "assessor-a",
  issuer: "https://identity.example.test",
  tenantId,
  roles: ["tenant_admin"],
  permissions: [
    "opportunities:read",
    "opportunities:evidence:create",
    "opportunities:interventions:create",
    "opportunities:interventions:update",
    "opportunities:assess"
  ]
};
const dimensions = {
  expectedImpact: { score: 4, rationale: "Removes a repeated manual handling step." },
  feasibility: { score: 4, rationale: "Required application interfaces are available." },
  implementationEffort: { score: 2, rationale: "A small integration and review flow are sufficient." },
  operationalRisk: { score: 2, rationale: "A human checkpoint remains for exceptions." },
  evidenceStrength: { score: 3, rationale: "A sample of recent cases was reviewed." }
};

function repository(): OpportunityIntelligenceRepository {
  return {
    listEvidence: vi.fn().mockResolvedValue([]),
    createEvidence: vi.fn().mockResolvedValue({ id: evidenceId }),
    listInterventions: vi.fn().mockResolvedValue([]),
    createIntervention: vi.fn().mockResolvedValue({ id: interventionId }),
    updateIntervention: vi.fn().mockResolvedValue({ id: interventionId, status: "shortlisted" }),
    listAssessments: vi.fn().mockResolvedValue([]),
    createAssessment: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", overallScore: 75.5 })
  };
}
function verifier(value: unknown = principal): IdentityVerifier {
  return { verify: vi.fn().mockResolvedValue(value) };
}

describe("opportunity evidence and intervention API", () => {
  it("creates source-linked evidence under the verified tenant", async () => {
    const repo = repository();
    const response = await request(createApp(verifier(), undefined, undefined, undefined, undefined, undefined, repo))
      .post("/api/v1/opportunities/" + opportunityId + "/evidence")
      .send({
        sourceKind: "direct_observation",
        claim: "A reviewer re-enters the same invoice fields in two systems.",
        sourceLabel: "Operations observation"
      });
    expect(response.status).toBe(201);
    expect(repo.createEvidence).toHaveBeenCalledWith(tenantId, opportunityId, "assessor-a", expect.objectContaining({
      sourceKind: "direct_observation"
    }));
  });

  it("creates non-automation intervention candidates", async () => {
    const repo = repository();
    const response = await request(createApp(verifier(), undefined, undefined, undefined, undefined, undefined, repo))
      .post("/api/v1/opportunities/" + opportunityId + "/interventions")
      .send({
        interventionType: "process_redesign",
        title: "Remove duplicate entry",
        description: "Capture invoice details once and route the same record to both review stages."
      });
    expect(response.status).toBe(201);
    expect(repo.createIntervention).toHaveBeenCalledWith(tenantId, opportunityId, "assessor-a", expect.objectContaining({
      interventionType: "process_redesign"
    }));
  });

  it("rejects client-supplied aggregate scores and accepts dimension-level assessment input", async () => {
    const repo = repository();
    const app = createApp(verifier(), undefined, undefined, undefined, undefined, undefined, repo);
    const invalid = await request(app)
      .post("/api/v1/opportunities/" + opportunityId + "/interventions/" + interventionId + "/assessments")
      .send({ dimensionScores: dimensions, rationale: "Assessment rationale is clear.", evidenceIds: [evidenceId], overallScore: 99 });
    const valid = await request(app)
      .post("/api/v1/opportunities/" + opportunityId + "/interventions/" + interventionId + "/assessments")
      .send({ dimensionScores: dimensions, rationale: "Assessment rationale is clear.", evidenceIds: [evidenceId] });

    expect(invalid.status).toBe(400);
    expect(repo.createAssessment).toHaveBeenCalledOnce();
    expect(valid.status).toBe(201);
    expect(repo.createAssessment).toHaveBeenCalledWith(tenantId, opportunityId, interventionId, "assessor-a", expect.objectContaining({
      dimensionScores: dimensions,
      evidenceIds: [evidenceId]
    }));
  });

  it("requires a distinct assessment permission", async () => {
    const repo = repository();
    const limited = { ...principal, permissions: principal.permissions.filter((item) => item !== "opportunities:assess") };
    const response = await request(createApp(verifier(limited), undefined, undefined, undefined, undefined, undefined, repo))
      .post("/api/v1/opportunities/" + opportunityId + "/interventions/" + interventionId + "/assessments")
      .send({ dimensionScores: dimensions, rationale: "Assessment rationale is clear.", evidenceIds: [evidenceId] });
    expect(response.status).toBe(403);
    expect(repo.createAssessment).not.toHaveBeenCalled();
  });

  it("computes a deterministic weighted score and inverts effort and risk", () => {
    const score = calculateInterventionScore(dimensions);
    expect(score).toBe(77);
    expect(calculateInterventionScore({
      expectedImpact: dimensions.expectedImpact,
      feasibility: dimensions.feasibility,
      implementationEffort: { score: 5, rationale: "High effort." },
      operationalRisk: { score: 5, rationale: "High risk." },
      evidenceStrength: dimensions.evidenceStrength
    })).toBeLessThan(score);
  });
});
