import { describe, expect, it } from "@jest/globals";
import { createPlanInviteCode } from "./planInviteCode";

describe("plan invitation codes", () => {
  it("creates compact URL-safe codes", () => {
    const code = createPlanInviteCode();

    expect(code).toHaveLength(16);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not repeat generated codes", () => {
    const codes = new Set(Array.from({ length: 100 }, createPlanInviteCode));

    expect(codes.size).toBe(100);
  });
});
