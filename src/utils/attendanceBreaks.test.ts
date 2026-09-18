/// <reference types="jest" />
import {
  applyEffectiveBreaksToAttendances,
  getAutomaticBreakMinutes,
  getEffectiveAutomaticBreakMinutes,
} from "./attendanceBreaks";

describe("automatic break policies", () => {
  test("preserves the legacy four-hour threshold", () => {
    expect(getAutomaticBreakMinutes(30, 239)).toBe(0);
    expect(getAutomaticBreakMinutes(30, 240)).toBe(30);
    expect(getAutomaticBreakMinutes(90, 45)).toBe(0);
  });

  test("falls back to the legacy rule when the employee has no policy history", () => {
    expect(getEffectiveAutomaticBreakMinutes({ defaultBreakMinutes: 30 }, 240, "2026-09-14")).toBe(30);
  });

  test("applies cumulative tiers from the effective snapshot", () => {
    const user = {
      defaultBreakMinutes: 30,
      breakPolicyAssignments: [{ companyId: "company-1", history: [{
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        effectiveTo: null,
        mode: "specific",
        policyId: "policy-1",
        policyName: "Field team",
        weekdays: [1, 2, 3, 4, 5],
        rules: [
          { afterMinutes: 240, deductMinutes: 30 },
          { afterMinutes: 360, deductMinutes: 30 },
        ],
      }] }],
    };

    expect(getEffectiveAutomaticBreakMinutes(user, 239, "2026-09-14")).toBe(0);
    expect(getEffectiveAutomaticBreakMinutes(user, 240, "2026-09-14")).toBe(30);
    expect(getEffectiveAutomaticBreakMinutes(user, 359, "2026-09-14")).toBe(30);
    expect(getEffectiveAutomaticBreakMinutes(user, 360, "2026-09-14")).toBe(60);
  });

  test("respects weekdays and effective periods", () => {
    const user = {
      defaultBreakMinutes: 15,
      breakPolicyAssignments: [{ companyId: "company-1", history: [{
        effectiveFrom: "2026-09-15T00:00:00.000Z",
        effectiveTo: null,
        mode: "company",
        policyId: "policy-1",
        policyName: "Weekdays",
        weekdays: [1, 2, 3, 4, 5],
        rules: [{ afterMinutes: 240, deductMinutes: 45 }],
      }] }],
    };

    expect(getEffectiveAutomaticBreakMinutes(user, 300, "2026-09-14")).toBe(15);
    expect(getEffectiveAutomaticBreakMinutes(user, 300, "2026-09-19")).toBe(0);
    expect(getEffectiveAutomaticBreakMinutes(user, 300, "2026-09-16")).toBe(45);
  });

  test("keeps the employee's legacy rule frozen for dates before the first assignment", () => {
    const user = {
      defaultBreakMinutes: 60,
      breakPolicyAssignments: [{ companyId: "company-1", history: [
        {
          effectiveFrom: "2025-01-01T00:00:00.000Z",
          effectiveTo: "2026-09-17T00:00:00.000Z",
          mode: "legacy",
          policyId: null,
          policyName: "Legacy rule",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          rules: [{ afterMinutes: 240, deductMinutes: 30 }],
        },
        {
          effectiveFrom: "2026-09-17T00:00:00.000Z",
          effectiveTo: null,
          mode: "specific",
          policyId: "policy-1",
          policyName: "Field team",
          weekdays: [1, 2, 3, 4, 5],
          rules: [{ afterMinutes: 360, deductMinutes: 60 }],
        },
      ] }],
    };

    expect(getEffectiveAutomaticBreakMinutes(user, 480, "2026-09-16", "company-1")).toBe(30);
    expect(getEffectiveAutomaticBreakMinutes(user, 480, "2026-09-17", "company-1")).toBe(60);
  });

  test("isolates policies by company for multi-company employees", () => {
    const user = {
      defaultBreakMinutes: 15,
      breakPolicyAssignments: [
        { companyId: "company-a", history: [{ effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, mode: "specific", policyId: "a", policyName: "A", weekdays: [1], rules: [{ afterMinutes: 240, deductMinutes: 30 }] }] },
        { companyId: "company-b", history: [{ effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, mode: "specific", policyId: "b", policyName: "B", weekdays: [1], rules: [{ afterMinutes: 240, deductMinutes: 60 }] }] },
      ],
    };

    expect(getEffectiveAutomaticBreakMinutes(user, 480, "2026-09-14", "company-a")).toBe(30);
    expect(getEffectiveAutomaticBreakMinutes(user, 480, "2026-09-14", "company-b")).toBe(60);
  });

  test("manual breaks remain independent from automatic policies", () => {
    const attendance: any = {
      id: "attendance-1",
      user_id: "user-1",
      company_id: "company-a",
      date: new Date("2026-09-14T00:00:00.000Z"),
      check_in_time: new Date("2026-09-14T08:00:00.000Z"),
      check_out_time: new Date("2026-09-14T16:00:00.000Z"),
      workStartTime: null,
      workEndTime: null,
      breakRecords: [{ startedAt: new Date("2026-09-14T12:00:00.000Z"), endedAt: new Date("2026-09-14T12:30:00.000Z") }],
      user: {
        id: "user-1",
        manualBreakEnabled: true,
        defaultBreakMinutes: 120,
        breakPolicyAssignments: [{ companyId: "company-a", history: [{ effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, mode: "specific", policyId: "a", policyName: "A", weekdays: [1], rules: [{ afterMinutes: 240, deductMinutes: 90 }] }] }],
      },
    };

    applyEffectiveBreaksToAttendances([attendance]);
    expect(attendance.__breakMinutesApplied).toBe(30);
  });

  test("keeps legacy report behavior while manual break mode is active", () => {
    const user = {
      manualBreakEnabled: true,
      defaultBreakMinutes: 30,
      breakPolicyAssignments: [{ companyId: "company-a", history: [{
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        effectiveTo: null,
        mode: "specific",
        policyId: "a",
        policyName: "A",
        weekdays: [1],
        rules: [{ afterMinutes: 240, deductMinutes: 90 }],
      }] }],
    };

    expect(getEffectiveAutomaticBreakMinutes(user, 480, "2026-09-14", "company-a")).toBe(30);
  });
});
