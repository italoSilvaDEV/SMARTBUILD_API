jest.mock("../../src/utils/prisma", () => ({ prisma: {} }));

import {
  calculateAttendancePresenceSummary,
  PresencePoint,
} from "../../src/services/TrackingPresenceSummaryService";

function point(minute: number, isInsideSite: boolean | null, latitude = 42, longitude = -71) {
  return {
    recordedAt: new Date(`2026-07-20T12:${String(minute).padStart(2, "0")}:00.000Z`),
    isInsideSite,
    latitude,
    longitude,
  } satisfies PresencePoint;
}

describe("calculateAttendancePresenceSummary", () => {
  const start = new Date("2026-07-20T12:00:00.000Z");

  it("adds inside and outside intervals and extends a fresh final point", () => {
    const summary = calculateAttendancePresenceSummary(
      [point(0, true), point(10, false), point(20, false)],
      start,
      new Date("2026-07-20T12:23:00.000Z")
    );

    expect(summary).toEqual({
      totalMinutes: 23,
      insideMinutes: 10,
      outsideMinutes: 13,
      untrackedMinutes: 0,
      pointCount: 3,
    });
  });

  it("does not classify a gap of thirty minutes or more", () => {
    const summary = calculateAttendancePresenceSummary(
      [point(0, true), point(30, false)],
      start,
      new Date("2026-07-20T12:35:00.000Z")
    );

    expect(summary.insideMinutes).toBe(0);
    expect(summary.outsideMinutes).toBe(5);
    expect(summary.untrackedMinutes).toBe(30);
  });

  it("does not classify an impossible five-kilometer jump", () => {
    const summary = calculateAttendancePresenceSummary(
      [point(0, true), point(10, false, 43, -72)],
      start,
      new Date("2026-07-20T12:10:00.000Z")
    );

    expect(summary.insideMinutes).toBe(0);
    expect(summary.outsideMinutes).toBe(0);
    expect(summary.untrackedMinutes).toBe(10);
  });

  it("keeps points with unknown presence unclassified", () => {
    const summary = calculateAttendancePresenceSummary(
      [point(0, null), point(10, true)],
      start,
      new Date("2026-07-20T12:12:00.000Z")
    );

    expect(summary.insideMinutes).toBe(2);
    expect(summary.outsideMinutes).toBe(0);
    expect(summary.untrackedMinutes).toBe(10);
  });
});
