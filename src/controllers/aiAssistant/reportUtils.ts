import { AssistantReport, AssistantReportTable, AssistantStructuredResponse } from "./types";

export function normalizeStructuredResponse(
  response: AssistantStructuredResponse,
  fallback: AssistantStructuredResponse
): AssistantStructuredResponse {
  const content = typeof response?.content === "string" && response.content.trim()
    ? response.content.trim()
    : fallback.content;

  const bullets = Array.isArray(response?.bullets)
    ? response.bullets.filter((item) => typeof item === "string" && item.trim()).slice(0, 6)
    : fallback.bullets || [];

  const followUp = typeof response?.followUp === "string" && response.followUp.trim()
    ? response.followUp.trim()
    : fallback.followUp;

  const report = response?.report && (response.report.chartData?.length || response.report.table?.rows?.length)
    ? response.report
    : fallback.report || null;

  return {
    content,
    bullets,
    followUp,
    report,
  };
}

export function buildTable(
  columns: { key: string; label: string }[],
  rows: Record<string, string | number | boolean | null>[]
): AssistantReportTable | null {
  if (!columns.length || !rows.length) return null;
  return {
    columns,
    rows,
  };
}

export function getCompactReport(report: AssistantReport | null): AssistantReport | null {
  if (!report) return null;
  return {
    ...report,
    chartData: Array.isArray(report.chartData) ? report.chartData.slice(0, 8) : [],
    metrics: Array.isArray(report.metrics) ? report.metrics.slice(0, 6) : [],
    table: report.table
      ? {
          columns: report.table.columns.slice(0, 8),
          rows: report.table.rows.slice(0, 12),
        }
      : null,
  };
}

export function compactValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= 2) {
    if (Array.isArray(value)) return `[${value.length} items]`;
    return "[object]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 6).map((item) => compactValue(item, depth + 1));
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 12);
  return Object.fromEntries(entries.map(([key, item]) => [key, compactValue(item, depth + 1)]));
}
