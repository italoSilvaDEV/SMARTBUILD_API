/// <reference types="jest" />
import {
  appendBreakPolicyHistory,
  buildLegacySnapshot,
  buildPolicySnapshot,
  normalizeBreakPolicyRules,
} from "./breakPolicies";

describe("break policy history", () => {
  test("orders rules and rejects duplicate thresholds", () => {
    expect(normalizeBreakPolicyRules([
      { afterMinutes: 360, deductMinutes: 30 },
      { afterMinutes: 240, deductMinutes: 30 },
    ])).toEqual([
      { afterMinutes: 240, deductMinutes: 30 },
      { afterMinutes: 360, deductMinutes: 30 },
    ]);

    expect(() => normalizeBreakPolicyRules([
      { afterMinutes: 240, deductMinutes: 30 },
      { afterMinutes: 240, deductMinutes: 15 },
    ])).toThrow("DUPLICATE_BREAK_POLICY_THRESHOLD");
  });

  test("closes the current period without rewriting older periods", () => {
    const first = buildLegacySnapshot(30, "2026-09-01T00:00:00.000Z");
    const second = buildPolicySnapshot({
      id: "policy-1",
      name: "New policy",
      rules: [{ afterMinutes: 360, deductMinutes: 60 }],
      weekdays: [1, 2, 3, 4, 5],
    }, "specific", "2026-10-01T00:00:00.000Z");

    expect(appendBreakPolicyHistory([first], second)).toEqual([
      { ...first, effectiveTo: "2026-10-01T00:00:00.000Z" },
      second,
    ]);
  });
});
