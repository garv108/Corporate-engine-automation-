import { describe, expect, it } from "vitest";
import { isRelationshipApproved, requiresAffectedPersonApproval } from "./relationship-governance";

describe("relationship approval routing", () => {
  it("requires both founder and affected person for collaboration and stakeholder links", () => {
    expect(requiresAffectedPersonApproval("Collaborates with")).toBe(true);
    expect(requiresAffectedPersonApproval("Stakeholder of")).toBe(true);
    expect(isRelationshipApproved({ type: "Collaborates with", founderApproved: true, affectedApproved: false })).toBe(false);
    expect(isRelationshipApproved({ type: "Stakeholder of", founderApproved: true, affectedApproved: true })).toBe(true);
  });

  it("requires founder approval for organization and workflow relationships", () => {
    expect(requiresAffectedPersonApproval("Reports to")).toBe(false);
    expect(isRelationshipApproved({ type: "Reports to", founderApproved: false, affectedApproved: true })).toBe(false);
    expect(isRelationshipApproved({ type: "Depends on", founderApproved: true, affectedApproved: false })).toBe(true);
  });
});
