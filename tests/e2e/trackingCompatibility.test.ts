import {
  isRecentlyClosedAttendance,
  shouldPublishTrackingPingLive,
} from "../../src/controllers/tracking/WorkerTrackingController";
import {
  getLiveLocationForAttendance,
  getTrackingHealthSnapshot,
} from "../../src/services/TrackingHealthService";

describe("tracking compatibility guards", () => {
  const now = new Date("2026-07-15T15:00:00.000Z");
  const attendance = {
    id: "attendance-current",
    check_in_time: new Date("2026-07-15T14:00:00.000Z"),
    check_out_time: null,
  };

  it("does not reuse a live location from another attendance", () => {
    const liveLocation = getLiveLocationForAttendance(
      attendance,
      {
        attendanceId: "attendance-previous",
        recordedAt: new Date("2026-07-15T14:55:00.000Z"),
      },
      now
    );

    expect(liveLocation).toBeNull();
  });

  it("keeps the legacy no-attendanceId bridge only inside the current shift window", () => {
    expect(
      getLiveLocationForAttendance(
        attendance,
        { attendanceId: null, recordedAt: new Date("2026-07-15T14:55:00.000Z") },
        now
      )
    ).not.toBeNull();
    expect(
      getLiveLocationForAttendance(
        attendance,
        { attendanceId: null, recordedAt: new Date("2026-07-15T13:55:00.000Z") },
        now
      )
    ).toBeNull();
  });

  it("rejects future-poisoned live rows", () => {
    expect(
      getLiveLocationForAttendance(
        attendance,
        {
          attendanceId: attendance.id,
          recordedAt: new Date("2026-07-15T15:06:00.000Z"),
        },
        now
      )
    ).toBeNull();
  });

  it("marks an attendance with no first ping as silent after the threshold", () => {
    const snapshot = getTrackingHealthSnapshot(
      { check_in_time: new Date("2026-07-15T14:30:00.000Z") },
      null,
      now
    );

    expect(snapshot.trackingHealth).toBe("silent");
    expect(snapshot.lastPingAt).toBeNull();
    expect(snapshot.ageMinutes).toBe(30);
  });

  it("publishes only open, in-window, non-future pings as live", () => {
    expect(
      shouldPublishTrackingPingLive(attendance, new Date("2026-07-15T14:59:00.000Z"), now)
    ).toBe(true);
    expect(
      shouldPublishTrackingPingLive(attendance, new Date("2026-07-15T13:59:00.000Z"), now)
    ).toBe(false);
    expect(
      shouldPublishTrackingPingLive(attendance, new Date("2026-07-15T15:06:00.000Z"), now)
    ).toBe(false);
    expect(
      shouldPublishTrackingPingLive(
        { ...attendance, check_out_time: new Date("2026-07-15T14:59:00.000Z") },
        new Date("2026-07-15T14:59:00.000Z"),
        now
      )
    ).toBe(false);
  });

  it("accepts only a recently closed attendance as a final history ping", () => {
    expect(
      isRecentlyClosedAttendance(
        { check_out_time: new Date("2026-07-15T14:46:00.000Z") },
        now
      )
    ).toBe(true);
    expect(
      isRecentlyClosedAttendance(
        { check_out_time: new Date("2026-07-15T14:44:00.000Z") },
        now
      )
    ).toBe(false);
  });
});
