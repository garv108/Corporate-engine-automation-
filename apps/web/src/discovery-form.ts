import type { DiscoveryStep } from "./discovery-api";

export type ProcessTransitionDraft = {
  fromStepKey: string;
  toStepKey: string;
  kind: "sequence";
};

export function buildLinearProcessGraph(source: string): {
  steps: DiscoveryStep[];
  transitions: ProcessTransitionDraft[];
} {
  const names = source.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (names.length === 0) throw new Error("Add at least one process step.");
  if (names.length > 200) throw new Error("A process map can contain at most 200 steps.");
  if (names.some((name) => name.length < 2 || name.length > 160)) {
    throw new Error("Each step must contain between 2 and 160 characters.");
  }

  const steps = names.map((name, index): DiscoveryStep => ({
    key: "step_" + (index + 1),
    kind: "activity",
    name,
    systems: [],
    inputs: [],
    outputs: [],
    rules: [],
    exceptions: []
  }));
  const transitions = steps.slice(0, -1).map((step, index): ProcessTransitionDraft => ({
    fromStepKey: step.key,
    toStepKey: steps[index + 1]!.key,
    kind: "sequence"
  }));
  return { steps, transitions };
}
