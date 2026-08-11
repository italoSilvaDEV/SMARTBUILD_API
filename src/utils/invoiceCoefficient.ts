export function normalizeInvoiceCoefficient(
  coefficient: unknown,
  typeValue?: string | null,
): number {
  const numericCoefficient = Number(coefficient);

  if (!Number.isFinite(numericCoefficient)) {
    return 1;
  }

  if (typeValue === "percentage") {
    return numericCoefficient > 1
      ? numericCoefficient / 100
      : numericCoefficient;
  }

  return numericCoefficient || 1;
}
