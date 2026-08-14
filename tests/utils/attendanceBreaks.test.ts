import {
  applyEffectiveBreaksToAttendances,
  MIN_AUTOMATIC_BREAK_WORKED_MINUTES,
} from "../../src/utils/attendanceBreaks";

function attendance({
  id,
  start,
  end,
  manualBreakEnabled = false,
  breakRecords = [],
}: {
  id: string;
  start: string;
  end: string;
  manualBreakEnabled?: boolean;
  breakRecords?: Array<{ startedAt: Date; endedAt: Date }>;
}): any {
  return {
    id,
    user_id: "worker-1",
    date: new Date(start),
    check_in_time: new Date(start),
    check_out_time: new Date(end),
    workStartTime: null,
    workEndTime: null,
    breakRecords,
    user: {
      id: "worker-1",
      defaultBreakMinutes: 30,
      manualBreakEnabled,
    },
  };
}

describe("applyEffectiveBreaksToAttendances", () => {
  it("does not apply an automatic break to a point shorter than four hours", () => {
    const record = attendance({
      id: "short-shift",
      start: "2026-08-14T08:00:00.000Z",
      end: "2026-08-14T11:59:00.000Z",
    });

    applyEffectiveBreaksToAttendances([record]);

    expect(MIN_AUTOMATIC_BREAK_WORKED_MINUTES).toBe(240);
    expect(record.__breakMinutesApplied).toBe(0);
    expect(record.user.defaultBreakMinutes).toBe(0);
  });

  it("applies the configured automatic break at exactly four hours", () => {
    const record = attendance({
      id: "eligible-shift",
      start: "2026-08-14T08:00:00.000Z",
      end: "2026-08-14T12:00:00.000Z",
    });

    applyEffectiveBreaksToAttendances([record]);

    expect(record.__breakMinutesApplied).toBe(30);
    expect(record.user.defaultBreakMinutes).toBe(30);
  });

  it("applies the automatic break to the first eligible point of the day", () => {
    const shortRecord = attendance({
      id: "short-first-point",
      start: "2026-08-14T08:00:00.000Z",
      end: "2026-08-14T10:00:00.000Z",
    });
    const eligibleRecord = attendance({
      id: "eligible-second-point",
      start: "2026-08-14T11:00:00.000Z",
      end: "2026-08-14T15:00:00.000Z",
    });

    applyEffectiveBreaksToAttendances([shortRecord, eligibleRecord]);

    expect(shortRecord.__breakMinutesApplied).toBe(0);
    expect(eligibleRecord.__breakMinutesApplied).toBe(30);
  });

  it("keeps real manual breaks independent from the automatic four-hour minimum", () => {
    const record = attendance({
      id: "manual-short-shift",
      start: "2026-08-14T08:00:00.000Z",
      end: "2026-08-14T10:00:00.000Z",
      manualBreakEnabled: true,
      breakRecords: [{
        startedAt: new Date("2026-08-14T09:00:00.000Z"),
        endedAt: new Date("2026-08-14T09:20:00.000Z"),
      }],
    });

    applyEffectiveBreaksToAttendances([record]);

    expect(record.__breakMinutesApplied).toBe(20);
    expect(record.user.defaultBreakMinutes).toBe(20);
  });
});
