export type NumericLike = number | string | null | undefined | { toString(): string };

export interface WorkedHoursLike {
  type_price?: "hourly" | "fixed" | null;
  amount_of_hours?: NumericLike;
  overtime_hours?: NumericLike;
  hourly_price?: NumericLike;
  fixed_price?: NumericLike;
}

export function workedHoursToNumber(value: NumericLike): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getWorkedHoursOvertimeHours(entry: WorkedHoursLike): number {
  const totalHours = workedHoursToNumber(entry.amount_of_hours);
  const overtimeHours = workedHoursToNumber(entry.overtime_hours);
  return Math.min(Math.max(overtimeHours, 0), totalHours);
}

export function getWorkedHoursRegularHours(entry: WorkedHoursLike): number {
  const totalHours = workedHoursToNumber(entry.amount_of_hours);
  const overtimeHours = getWorkedHoursOvertimeHours(entry);
  return Math.max(totalHours - overtimeHours, 0);
}

export function getWorkedHoursPrice(entry: WorkedHoursLike): number {
  if (entry.type_price === "fixed") {
    return workedHoursToNumber(entry.fixed_price);
  }

  if (entry.amount_of_hours == null) {
    return workedHoursToNumber(entry.hourly_price);
  }

  const hourlyRate = workedHoursToNumber(entry.hourly_price);
  const regularHours = getWorkedHoursRegularHours(entry);
  const overtimeHours = getWorkedHoursOvertimeHours(entry);

  return parseFloat(
    (regularHours * hourlyRate + overtimeHours * hourlyRate * 1.5).toFixed(2)
  );
}
