export type DiscoveryLike = {
  taskName: string; employeeId: string; requester: string; purpose: string; workType: "Recurring" | "Ad hoc";
  cadence: string; trigger: string; inputs: string[]; outputs: string[]; handoffs: string[]; steps: string[]; effort: string;
};
export type TaskProposalDraft = { title: string; description: string; ownerId: string; requestedBy: string; estimatedMinutes: number };

export function toTaskProposal(record: DiscoveryLike): TaskProposalDraft {
  const details = [
    record.purpose,
    record.workType === "Recurring" ? `Pattern: ${record.cadence}` : "Ad hoc work",
    record.trigger && `Trigger: ${record.trigger}`,
    record.inputs.length > 0 && `Inputs: ${record.inputs.join(", ")}`,
    record.outputs.length > 0 && `Outputs: ${record.outputs.join(", ")}`,
    record.handoffs.length > 0 && `Hand-offs: ${record.handoffs.join(", ")}`,
    record.steps.length > 0 && `Steps: ${record.steps.join(" → ")}`
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const amount = Number(record.effort.match(/\d+(?:\.\d+)?/)?.[0] ?? 60);
  const minutes = /\b(hours?|hrs?)\b/i.test(record.effort) ? amount * 60 : /\b(days?)\b/i.test(record.effort) ? amount * 480 : amount;
  return { title: record.taskName.trim(), description: details.join("\n"), ownerId: record.employeeId, requestedBy: record.requester.trim() || "Discovery interview", estimatedMinutes: Math.max(15, minutes) };
}
