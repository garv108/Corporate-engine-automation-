import { describe, expect, it } from "vitest";
import { toTaskProposal } from "./task-discovery-model";

const base = { taskName: "  Reconcile invoices ", employeeId: "e1", requester: "Finance lead", purpose: "Match payments", workType: "Recurring" as const, cadence: "Weekly", trigger: "Friday", inputs: ["Bank file"], outputs: ["Reconciliation sheet"], handoffs: ["Send to manager"], steps: ["Import", "Match"], effort: "45 minutes" };

describe("discovery finding to task proposal", () => {
  it("preserves ownership and useful process context", () => {
    const proposal = toTaskProposal(base);
    expect(proposal).toMatchObject({ title: "Reconcile invoices", ownerId: "e1", requestedBy: "Finance lead", estimatedMinutes: 45 });
    expect(proposal.description).toContain("Pattern: Weekly");
    expect(proposal.description).toContain("Steps: Import → Match");
    expect(proposal.description).toContain("Hand-offs: Send to manager");
  });
  it("uses safe defaults for ad hoc work with missing effort and requester", () => {
    const proposal = toTaskProposal({ ...base, workType: "Ad hoc", cadence: "", requester: "", effort: "not sure", inputs: [], outputs: [], handoffs: [], steps: [] });
    expect(proposal.requestedBy).toBe("Discovery interview");
    expect(proposal.estimatedMinutes).toBe(60);
    expect(proposal.description).toContain("Ad hoc work");
    expect(proposal.description).not.toContain("Pattern:");
  });
  it("converts hour estimates into task minutes", () => {
    expect(toTaskProposal({ ...base, effort: "2 hours" }).estimatedMinutes).toBe(120);
  });
});
