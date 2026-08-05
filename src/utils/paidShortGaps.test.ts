import { describe, expect, it } from "@jest/globals";

import {
  applyPaidShortGapsToAttendances,
  getPaidShortGapEligibleAt,
  getPaidShortGapMinutes,
} from "./paidShortGaps";

function attendance(
  id: string,
  checkIn: string,
  checkOut: string | null,
) {
  return {
    id,
    user_id: "worker-1",
    check_in_time: new Date(checkIn),
    check_out_time: checkOut ? new Date(checkOut) : null,
    user: {
      id: "worker-1",
      paidShortGapEnabled: true,
    },
  };
}

describe("paid short-gap eligibility", () => {
  it("becomes eligible when the following completed attendance enters the bucket", () => {
    const first = attendance("first", "2026-08-04T10:00:00.000Z", "2026-08-04T11:00:00.000Z");
    const next = attendance("next", "2026-08-04T11:10:00.000Z", "2026-08-04T12:00:00.000Z");

    applyPaidShortGapsToAttendances([first, next]);

    expect(getPaidShortGapMinutes(first)).toBe(10);
    expect(getPaidShortGapEligibleAt(first)?.toISOString()).toBe("2026-08-04T12:00:00.000Z");
  });

  it("uses check-in as the eligibility boundary for an open following attendance", () => {
    const first = attendance("first", "2026-08-04T10:00:00.000Z", "2026-08-04T11:00:00.000Z");
    const next = attendance("next", "2026-08-04T11:10:00.000Z", null);

    applyPaidShortGapsToAttendances([first, next]);

    expect(getPaidShortGapMinutes(first)).toBe(10);
    expect(getPaidShortGapEligibleAt(first)?.toISOString()).toBe("2026-08-04T11:10:00.000Z");
  });
});
