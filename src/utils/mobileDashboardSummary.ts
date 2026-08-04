export type DashboardSeriesBucket = {
    label: string;
};

export type DashboardSeriesPoint = {
    label: string;
    value: number;
};

export function normalizeDashboardNumber(value: unknown) {
    if (typeof value === "bigint") return Number(value);

    const normalized = Number(value ?? 0);
    return Number.isFinite(normalized) ? normalized : 0;
}

export function mapCumulativeCountRow(
    row: Record<string, unknown> | undefined,
    buckets: DashboardSeriesBucket[]
): DashboardSeriesPoint[] {
    return buckets.map((bucket, index) => ({
        label: bucket.label,
        value: normalizeDashboardNumber(row?.[`bucket${index}`])
    }));
}

export function getSeriesTotal(series: DashboardSeriesPoint[]) {
    return series.length > 0 ? series[series.length - 1].value : 0;
}

