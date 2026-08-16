export type SmartBuilderPricingIntent =
  | "standard"
  | "copy_exact"
  | "copy_with_changes"
  | "exact_total"
  | "approximate_total"
  | "not_exceed";

export type TargetPricingInstruction = {
  pricingIntent: SmartBuilderPricingIntent;
  targetTotal: number | null;
  toleranceType: "exact" | "approximate" | "not_exceed" | null;
  toleranceAmount: number | null;
};

type PricedService = {
  quantity?: number | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
};

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function numberOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMoneyAmount(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  const multiplier = /\bk\b/.test(normalized) ? 1_000 : /\b(m|million)\b/.test(normalized) ? 1_000_000 : 1;
  const cleaned = normalized
    .replace(/[$,\s]/g, "")
    .replace(/\b(k|m|million|dollars?|usd)\b/g, "")
    .replace(/[^\d.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? roundCurrency(parsed * multiplier) : null;
}

export function extractTargetPricingInstruction(message: string): TargetPricingInstruction {
  const normalized = String(message || "").toLowerCase();
  const isNotExceed = [
    "not exceed",
    "do not exceed",
    "don't exceed",
    "no more than",
    "maximum",
    "max ",
    "under ",
    "below ",
    "up to",
    "nao passar",
    "não passar",
    "maximo",
    "máximo",
  ].some((term) => normalized.includes(term));
  const isApproximate = [
    "around",
    "about",
    "approximately",
    "approx",
    "roughly",
    "near",
    "close to",
    "cerca",
    "aproximadamente",
    "por volta",
    "perto de",
  ].some((term) => normalized.includes(term));
  const hasExplicitTotalIntent = isNotExceed || /(?:\btarget\b|\btotal\b|\bbudget\b|\bamount\b|\ball[- ]in\b|\bcontract\s+(?:price|value|amount)\b|\bestimate\s+(?:to|at|for)\b|\bvalor\s+(?:total|final)\b|\bor[cç]amento\b)/i.test(normalized);

  if (!hasExplicitTotalIntent) {
    return {
      pricingIntent: "standard",
      targetTotal: null,
      toleranceType: null,
      toleranceAmount: null,
    };
  }

  const moneyMatches = Array.from(normalized.matchAll(/(?:\$|usd\s*)?\d[\d,]*(?:\.\d{1,2})?\s*(?:k|m|million|dollars?|usd)?/gi))
    .map((match) => {
      const raw = match[0];
      const index = typeof match.index === "number" ? match.index : 0;
      const context = normalized.slice(Math.max(0, index - 55), index + raw.length + 55);
      const before = normalized.slice(Math.max(0, index - 45), index);
      const after = normalized.slice(index + raw.length, index + raw.length + 20);
      const hasCurrencySignal = /[$]|\busd\b|\bdollars?\b|\bk\b|\bm\b|\bmillion\b/i.test(raw);
      const hasTargetContext = /(?:\btarget\b|\btotal\b|\bbudget\b|\bamount\b|\ball[- ]in\b|\bcontract\b|\bnot exceed\b|\bmaximum\b|\bmax\b|\bvalor\b|\bor[cç]amento\b)/i.test(context);
      const hasDirectTargetLabel = /(?:\btarget\b|\btotal\b|\bbudget\b|\bamount\b|\ball[- ]in\b|\bcontract\s+(?:price|value|amount)\b|\bvalor\s+(?:total|final)\b)\s*[:=]?\s*$/i.test(before);
      const isPerUnitRate = /^\s*(?:\/|per\b)/i.test(after);
      const parsed = parseMoneyAmount(raw);

      if (parsed === null) return null;
      if (!hasCurrencySignal && !hasTargetContext) return null;
      if (!hasCurrencySignal && !hasDirectTargetLabel) return null;
      if (isPerUnitRate && !hasDirectTargetLabel) return null;
      if (!hasCurrencySignal && parsed >= 1900 && parsed <= 2099 && /\b(19|20)\d{2}\b/.test(raw)) return null;

      return parsed;
    })
    .filter((value): value is number => typeof value === "number" && value > 0);
  const targetTotal = moneyMatches.length ? moneyMatches[moneyMatches.length - 1] : null;

  if (!targetTotal) {
    return {
      pricingIntent: "standard",
      targetTotal: null,
      toleranceType: null,
      toleranceAmount: null,
    };
  }

  if (isNotExceed) {
    return {
      pricingIntent: "not_exceed",
      targetTotal,
      toleranceType: "not_exceed",
      toleranceAmount: 1,
    };
  }

  if (isApproximate) {
    return {
      pricingIntent: "approximate_total",
      targetTotal,
      toleranceType: "approximate",
      toleranceAmount: roundCurrency(targetTotal * 0.02),
    };
  }

  return {
    pricingIntent: "exact_total",
    targetTotal,
    toleranceType: "exact",
    toleranceAmount: 1,
  };
}

function sumServices(services: PricedService[]) {
  return roundCurrency(services.reduce((total, service) => {
    const quantity = numberOr(service.quantity, 1) || 1;
    const unitPrice = roundCurrency(numberOr(service.unitPrice, 0));
    const lineTotal = roundCurrency(numberOr(service.lineTotal, quantity * unitPrice));
    return total + lineTotal;
  }, 0));
}

export function reconcileServicesToTarget<T extends PricedService>(
  services: T[],
  instruction: TargetPricingInstruction
): { services: T[]; adjusted: boolean; proposedTotal: number } {
  const current = Array.isArray(services) ? services : [];
  const currentTotal = sumServices(current);
  const targetTotal = instruction.targetTotal;

  if (!current.length || targetTotal === null || targetTotal <= 0 || currentTotal <= 0) {
    return { services: current, adjusted: false, proposedTotal: currentTotal };
  }

  const variance = roundCurrency(currentTotal - targetTotal);
  const shouldAdjust = instruction.pricingIntent === "exact_total"
    ? Math.abs(variance) > 1
    : instruction.pricingIntent === "approximate_total"
      ? Math.abs(variance) > roundCurrency(targetTotal * 0.02)
      : instruction.pricingIntent === "not_exceed"
        ? variance > 1
        : false;

  if (!shouldAdjust) {
    return { services: current, adjusted: false, proposedTotal: currentTotal };
  }

  const scale = targetTotal / currentTotal;
  const adjustedServices = current.map((service) => {
    const quantity = numberOr(service.quantity, 1) || 1;
    const originalUnitPrice = roundCurrency(numberOr(service.unitPrice, 0));
    const originalLineTotal = roundCurrency(numberOr(service.lineTotal, quantity * originalUnitPrice));
    const unitPrice = roundCurrency((originalLineTotal * scale) / quantity);

    return {
      ...service,
      quantity,
      unitPrice,
      lineTotal: roundCurrency(quantity * unitPrice),
    };
  });

  const adjustmentIndex = adjustedServices.reduce((bestIndex, service, index) => {
    const bestQuantity = Math.abs(numberOr(adjustedServices[bestIndex]?.quantity, Number.MAX_SAFE_INTEGER)) || Number.MAX_SAFE_INTEGER;
    const quantity = Math.abs(numberOr(service.quantity, Number.MAX_SAFE_INTEGER)) || Number.MAX_SAFE_INTEGER;
    return quantity < bestQuantity ? index : bestIndex;
  }, 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const proposedTotal = sumServices(adjustedServices);
    const remaining = roundCurrency(targetTotal - proposedTotal);
    if (Math.abs(remaining) < 0.01) break;

    const service = adjustedServices[adjustmentIndex];
    const quantity = numberOr(service.quantity, 1) || 1;
    const unitPrice = roundCurrency(numberOr(service.unitPrice, 0) + (remaining / quantity));
    adjustedServices[adjustmentIndex] = {
      ...service,
      unitPrice,
      lineTotal: roundCurrency(quantity * unitPrice),
    };
  }

  return {
    services: adjustedServices,
    adjusted: true,
    proposedTotal: sumServices(adjustedServices),
  };
}
