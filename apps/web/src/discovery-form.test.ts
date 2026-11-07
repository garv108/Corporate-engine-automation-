import { describe, expect, it } from "vitest";
import { buildLinearProcessGraph } from "./discovery-form";

describe("buildLinearProcessGraph", () => {
  it("creates stable activity keys and explicit sequential transitions", () => {
    const graph = buildLinearProcessGraph("Receive request\nCheck details\nRecord outcome");
    expect(graph.steps.map((step) => ({ key: step.key, kind: step.kind, name: step.name }))).toEqual([
      { key: "step_1", kind: "activity", name: "Receive request" },
      { key: "step_2", kind: "activity", name: "Check details" },
      { key: "step_3", kind: "activity", name: "Record outcome" }
    ]);
    expect(graph.transitions).toEqual([
      { fromStepKey: "step_1", toStepKey: "step_2", kind: "sequence" },
      { fromStepKey: "step_2", toStepKey: "step_3", kind: "sequence" }
    ]);
  });

  it("trims blank lines and rejects an empty or oversized step", () => {
    expect(buildLinearProcessGraph("  Receive request  \n\n Check details ").steps).toHaveLength(2);
    expect(() => buildLinearProcessGraph("\n \n")).toThrow("Add at least one process step");
    expect(() => buildLinearProcessGraph("x")).toThrow("between 2 and 160 characters");
    expect(() => buildLinearProcessGraph("a".repeat(161))).toThrow("between 2 and 160 characters");
  });
});
