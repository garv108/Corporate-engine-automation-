import { describe, expect, it } from "vitest";
import { navigation } from "./navigation";

describe("CIAS dashboard navigation", () => {
  it("contains the core product workspaces", () => {
    expect(navigation).toContain("Departments");
    expect(navigation).toContain("Work Discovery");
    expect(navigation).toContain("Research Hub");
    expect(navigation).toContain("Workflow Studio");
    expect(navigation).toContain("Approvals");
  });

  it("has no duplicate navigation labels", () => {
    expect(new Set(navigation).size).toBe(navigation.length);
  });
});
