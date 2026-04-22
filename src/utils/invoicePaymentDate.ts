import { DateTime } from "luxon";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE = "UTC";

export class InvoicePaymentDateError extends Error {}

function isValidIanaTimezone(timezone: string): boolean {
  return DateTime.now().setZone(timezone).isValid;
}

function normalizeDateOnly(date: string): string {
  return date.trim();
}

function parseDateOnlyUtc(dateOnly: string): DateTime {
  return DateTime.fromFormat(dateOnly, "yyyy-MM-dd", { zone: "UTC" });
}

export function resolvePaymentClientTimezone(clientTimezone?: unknown): string {
  if (typeof clientTimezone !== "string") return DEFAULT_TIMEZONE;

  const normalizedTimezone = clientTimezone.trim();
  if (!normalizedTimezone) return DEFAULT_TIMEZONE;

  if (!isValidIanaTimezone(normalizedTimezone)) {
    throw new InvoicePaymentDateError("Invalid client timezone");
  }

  return normalizedTimezone;
}

export function resolveManualPaymentDate(input: {
  paidAtDate?: unknown;
  clientTimezone?: unknown;
}) {
  const timezone = resolvePaymentClientTimezone(input.clientTimezone);
  const todayInClientTimezone = DateTime.now()
    .setZone(timezone)
    .toFormat("yyyy-MM-dd");

  let dateOnly = todayInClientTimezone;

  if (input.paidAtDate != null && input.paidAtDate !== "") {
    if (typeof input.paidAtDate !== "string") {
      throw new InvoicePaymentDateError("Payment date must be a string in YYYY-MM-DD format");
    }

    dateOnly = normalizeDateOnly(input.paidAtDate);

    if (!DATE_ONLY_REGEX.test(dateOnly)) {
      throw new InvoicePaymentDateError("Payment date must use YYYY-MM-DD format");
    }

    const parsedDate = parseDateOnlyUtc(dateOnly);
    if (!parsedDate.isValid) {
      throw new InvoicePaymentDateError("Payment date is invalid");
    }

    if (dateOnly > todayInClientTimezone) {
      throw new InvoicePaymentDateError("Payment date cannot be in the future");
    }
  }

  const paidAt = DateTime.fromISO(`${dateOnly}T00:00:00.000Z`, { zone: "UTC" }).toJSDate();

  return {
    paidAt,
    paidAtDate: dateOnly,
    clientTimezone: timezone,
    formattedDate: formatInvoicePaymentDate(dateOnly),
  };
}

export function formatInvoicePaymentDate(
  value: string | Date,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
): string {
  let utcDate: Date;

  if (typeof value === "string") {
    const normalized = normalizeDateOnly(value);

    if (DATE_ONLY_REGEX.test(normalized)) {
      utcDate = new Date(`${normalized}T00:00:00.000Z`);
    } else {
      const parsed = new Date(normalized);
      if (Number.isNaN(parsed.getTime())) return "";
      utcDate = parsed;
    }
  } else {
    utcDate = value;
  }

  if (Number.isNaN(utcDate.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(utcDate);
}
