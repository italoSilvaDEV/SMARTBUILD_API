export const OPENAI_TOOL_TIMEOUT_MS = 60000;
export const OPENAI_SYNTHESIS_TIMEOUT_MS = 45000;
export const PLANNER_HISTORY_MESSAGE_LIMIT = 8;
export const PLANNER_MESSAGE_CHAR_LIMIT = 500;
export const ACTIVE_PROJECT_STATUSES = ["Pre-Start", "In Progress", "Final walkthrough"] as const;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number(String(value)) || 0;
  }
  return 0;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

export function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function getRequestedDateRange(input: Record<string, unknown>) {
  const exactDate = parseDateValue(input.date);
  const startDate = parseDateValue(input.startDate);
  const endDate = parseDateValue(input.endDate);
  const period = String(input.period || "");

  let rangeStart = exactDate ? startOfDay(exactDate) : startDate ? startOfDay(startDate) : null;
  let rangeEnd = exactDate ? endOfDay(exactDate) : endDate ? endOfDay(endDate) : null;

  if (!rangeStart && !rangeEnd && period) {
    const now = new Date();

    switch (period) {
      case "thisWeek": {
        const day = now.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const start = new Date(now);
        start.setDate(now.getDate() + diffToMonday);
        rangeStart = startOfDay(start);
        rangeEnd = endOfDay(now);
        break;
      }
      case "lastWeek": {
        const day = now.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const start = new Date(now);
        start.setDate(now.getDate() + diffToMonday - 7);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        rangeStart = startOfDay(start);
        rangeEnd = endOfDay(end);
        break;
      }
      case "thisMonth":
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        rangeEnd = endOfDay(now);
        break;
      case "lastMonth":
        rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        rangeEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case "last30Days": {
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        rangeStart = startOfDay(start);
        rangeEnd = endOfDay(now);
        break;
      }
      case "thisYear":
        rangeStart = new Date(now.getFullYear(), 0, 1);
        rangeEnd = endOfDay(now);
        break;
      default:
        break;
    }
  }

  return { rangeStart, rangeEnd };
}

export function describeRequestedDateRange(input: Record<string, unknown>) {
  const { rangeStart, rangeEnd } = getRequestedDateRange(input);
  const period = String(input.period || "").trim();
  const periodLabelMap: Record<string, string> = {
    thisWeek: "this week",
    lastWeek: "last week",
    thisMonth: "this month",
    lastMonth: "last month",
    last30Days: "the last 30 days",
    thisYear: "this year",
  };

  const formatDate = (value: Date | null) =>
    value
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(value)
      : null;

  const periodLabel = periodLabelMap[period] || null;
  const startLabel = formatDate(rangeStart);
  const endLabel = formatDate(rangeEnd);

  return {
    period: period || null,
    periodLabel: periodLabel || "the selected period",
    dateRangeLabel: startLabel && endLabel ? `${startLabel} to ${endLabel}` : startLabel || endLabel || "No date filter",
    rangeStart,
    rangeEnd,
  };
}

export function getComparisonDateRanges(input: Record<string, unknown>) {
  const current = describeRequestedDateRange(input);
  if (!current.rangeStart || !current.rangeEnd) {
    return {
      current,
      previous: {
        period: null,
        periodLabel: "the previous period",
        dateRangeLabel: "No comparison period",
        rangeStart: null,
        rangeEnd: null,
      },
    };
  }

  const compareStartDate = parseDateValue(input.compareStartDate);
  const compareEndDate = parseDateValue(input.compareEndDate);

  if (compareStartDate || compareEndDate) {
    const previousStart = compareStartDate ? startOfDay(compareStartDate) : null;
    const previousEnd = compareEndDate ? endOfDay(compareEndDate) : null;

    const formatDate = (value: Date | null) =>
      value
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(value)
        : null;

    return {
      current,
      previous: {
        period: "custom",
        periodLabel: "the comparison period",
        dateRangeLabel:
          previousStart && previousEnd
            ? `${formatDate(previousStart)} to ${formatDate(previousEnd)}`
            : formatDate(previousStart) || formatDate(previousEnd) || "No comparison period",
        rangeStart: previousStart,
        rangeEnd: previousEnd,
      },
    };
  }

  const durationMs = current.rangeEnd.getTime() - current.rangeStart.getTime();
  const previousEnd = new Date(current.rangeStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);

  const formatDate = (value: Date | null) =>
    value
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(value)
      : null;

  return {
    current,
    previous: {
      period: "previousPeriod",
      periodLabel: "the previous period",
      dateRangeLabel: `${formatDate(previousStart)} to ${formatDate(previousEnd)}`,
      rangeStart: previousStart,
      rangeEnd: previousEnd,
    },
  };
}

export function inferRelativePeriodFromQuestion(question: string): string | null {
  const normalized = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!normalized) return null;

  if (
    /\b(this month|current month|este mes|desse mes|esse mes|mes atual|mes corrente)\b/.test(normalized)
  ) {
    return "thisMonth";
  }

  if (/\b(last month|previous month|mes passado)\b/.test(normalized)) {
    return "lastMonth";
  }

  if (/\b(this week|current week|esta semana|essa semana|semana atual)\b/.test(normalized)) {
    return "thisWeek";
  }

  if (/\b(last week|previous week|semana passada)\b/.test(normalized)) {
    return "lastWeek";
  }

  if (/\b(last 30 days|ultimos 30 dias|ultimos trinta dias)\b/.test(normalized)) {
    return "last30Days";
  }

  if (/\b(this year|current year|este ano|esse ano|ano atual)\b/.test(normalized)) {
    return "thisYear";
  }

  return null;
}

export function trimMessageContent(value: string, max = PLANNER_MESSAGE_CHAR_LIMIT) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

export function getActiveProjectStatuses() {
  return [...ACTIVE_PROJECT_STATUSES];
}

export function getActiveProjectStatusFilter() {
  return { in: getActiveProjectStatuses() };
}
