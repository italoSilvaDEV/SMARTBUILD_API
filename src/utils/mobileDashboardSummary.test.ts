import { describe, expect, it } from "@jest/globals";

import {
    getSeriesTotal,
    mapCumulativeCountRow,
    normalizeDashboardNumber
} from "./mobileDashboardSummary";

describe("mobile dashboard summary helpers", () => {
    it("normalizes bigint and decimal-compatible values", () => {
        expect(normalizeDashboardNumber(BigInt(12))).toBe(12);
        expect(normalizeDashboardNumber("29.95")).toBe(29.95);
        expect(normalizeDashboardNumber(undefined)).toBe(0);
    });

    it("maps conditional aggregate columns to labeled series", () => {
        const series = mapCumulativeCountRow(
            { bucket0: BigInt(2), bucket1: BigInt(7) },
            [{ label: "Jan" }, { label: "Feb" }]
        );

        expect(series).toEqual([
            { label: "Jan", value: 2 },
            { label: "Feb", value: 7 }
        ]);
        expect(getSeriesTotal(series)).toBe(7);
    });
});

