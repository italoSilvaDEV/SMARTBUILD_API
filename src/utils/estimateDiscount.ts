export type EstimateDiscountType = "fixed" | "percentage" | null | undefined;
export type EstimateAdjustmentType = EstimateDiscountType;

type DecimalLike = { toString(): string; valueOf?: () => string | number; toNumber?: () => number };

type NumericLike = number | string | DecimalLike | null | undefined;

type EstimateServiceLike = {
  quantity?: NumericLike;
  unitPrice?: NumericLike;
  lineTotal?: NumericLike;
  price?: NumericLike;
  originalUnitPrice?: NumericLike;
  originalLineTotal?: NumericLike;
};

const toNumber = (value: NumericLike, fallback = 0): number => {
  if (value === null || value === undefined || value === '') return fallback;

  if (typeof value === 'object') {
    if (typeof value.toNumber === 'function') {
      const numericValue = Number(value.toNumber());
      return Number.isFinite(numericValue) ? numericValue : fallback;
    }

    if (typeof value.valueOf === 'function') {
      const primitiveValue = value.valueOf();
      const numericValue = Number(primitiveValue);
      if (Number.isFinite(numericValue)) return numericValue;
    }

    const stringValue = value.toString();
    const numericFromString = Number(stringValue);
    return Number.isFinite(numericFromString) ? numericFromString : fallback;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const round = (value: number, precision: number) => {
  const factor = Math.pow(10, precision);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const round2 = (value: number) => round(value, 2);
const round6 = (value: number) => round(value, 6);

export const normalizeEstimateDiscountType = (value: unknown): EstimateDiscountType => {
  if (value === "fixed" || value === "percentage") return value;
  return null;
};

export const normalizeEstimateAdjustmentType = normalizeEstimateDiscountType;

export const getEstimateServiceQuantity = (service: EstimateServiceLike): number => {
  return Math.max(1, toNumber(service.quantity, 1));
};

export const getEstimateServiceOriginalUnitPrice = (service: EstimateServiceLike): number => {
  if (service.originalUnitPrice !== undefined && service.originalUnitPrice !== null && service.originalUnitPrice !== "") {
    return round2(toNumber(service.originalUnitPrice, 0));
  }

  if (service.unitPrice !== undefined && service.unitPrice !== null && service.unitPrice !== "") {
    return round2(toNumber(service.unitPrice, 0));
  }

  return round2(toNumber(service.price, 0));
};

export const getEstimateServiceOriginalLineTotal = (service: EstimateServiceLike): number => {
  if (service.originalLineTotal !== undefined && service.originalLineTotal !== null && service.originalLineTotal !== "") {
    return round2(toNumber(service.originalLineTotal, 0));
  }

  if (service.lineTotal !== undefined && service.lineTotal !== null && service.lineTotal !== "") {
    return round2(toNumber(service.lineTotal, 0));
  }

  return round2(getEstimateServiceQuantity(service) * getEstimateServiceOriginalUnitPrice(service));
};

export const calculateEstimateDiscountTotals = ({
  subtotal,
  amountPaid,
  markupType,
  markupValue,
  discountType,
  discountValue,
  depositType,
  depositValue,
}: {
  subtotal: NumericLike;
  amountPaid?: NumericLike;
  markupType?: EstimateAdjustmentType;
  markupValue?: NumericLike;
  discountType?: EstimateDiscountType;
  discountValue?: NumericLike;
  depositType?: EstimateAdjustmentType;
  depositValue?: NumericLike;
}) => {
  const normalizedSubtotal = round2(Math.max(0, toNumber(subtotal, 0)));
  const normalizedAmountPaid = round2(Math.max(0, toNumber(amountPaid, 0)));
  const normalizedMarkupType = normalizeEstimateAdjustmentType(markupType);
  const rawMarkupValue = round2(Math.max(0, toNumber(markupValue, 0)));
  const normalizedType = normalizeEstimateDiscountType(discountType);
  const rawDiscountValue = round2(Math.max(0, toNumber(discountValue, 0)));
  const normalizedDepositType = normalizeEstimateAdjustmentType(depositType);
  const rawDepositValue = round2(Math.max(0, toNumber(depositValue, 0)));

  if (normalizedMarkupType === "percentage" && rawMarkupValue > 100) {
    throw new Error("Percentage markup cannot be greater than 100");
  }

  const markupAmount = normalizedMarkupType && rawMarkupValue > 0
    ? normalizedMarkupType === "percentage"
      ? round2((normalizedSubtotal * rawMarkupValue) / 100)
      : round2(rawMarkupValue)
    : null;

  const subtotalWithMarkup = round2(normalizedSubtotal + (markupAmount || 0));

  if (normalizedType === "percentage" && rawDiscountValue > 100) {
    throw new Error("Percentage discount cannot be greater than 100");
  }

  if (normalizedType === "fixed" && rawDiscountValue > subtotalWithMarkup) {
    throw new Error("Fixed discount cannot be greater than estimate subtotal");
  }

  const computedDiscountAmount = normalizedType && rawDiscountValue > 0
    ? normalizedType === "percentage"
      ? round2((subtotalWithMarkup * rawDiscountValue) / 100)
      : round2(rawDiscountValue)
    : null;

  const finalTotal = round2(Math.max(0, subtotalWithMarkup - (computedDiscountAmount || 0)));

  if (normalizedDepositType === "percentage" && rawDepositValue > 100) {
    throw new Error("Percentage deposit cannot be greater than 100");
  }

  if (normalizedDepositType === "fixed" && rawDepositValue > finalTotal) {
    throw new Error("Fixed deposit cannot be greater than estimate total");
  }

  const depositAmount = normalizedDepositType && rawDepositValue > 0
    ? normalizedDepositType === "percentage"
      ? round2((finalTotal * rawDepositValue) / 100)
      : round2(rawDepositValue)
    : null;

  return {
    subtotal: normalizedSubtotal,
    amountPaid: normalizedAmountPaid,
    markupType: markupAmount ? normalizedMarkupType : null as EstimateAdjustmentType,
    markupValue: markupAmount ? rawMarkupValue : null as number | null,
    markupAmount,
    subtotalWithMarkup,
    discountType: computedDiscountAmount ? normalizedType : null as EstimateDiscountType,
    discountValue: computedDiscountAmount ? rawDiscountValue : null as number | null,
    discountAmount: computedDiscountAmount,
    depositType: depositAmount ? normalizedDepositType : null as EstimateAdjustmentType,
    depositValue: depositAmount ? rawDepositValue : null as number | null,
    depositAmount,
    totalAmount: finalTotal,
    finalAmount: finalTotal,
    balanceDue: round2(Math.max(0, finalTotal - normalizedAmountPaid)),
  };
};

export const buildEstimateFinancialFields = ({
  subtotal,
  amountPaid,
  markupType,
  markupValue,
  discountType,
  discountValue,
  depositType,
  depositValue,
}: {
  subtotal: NumericLike;
  amountPaid?: NumericLike;
  markupType?: EstimateAdjustmentType;
  markupValue?: NumericLike;
  discountType?: EstimateDiscountType;
  discountValue?: NumericLike;
  depositType?: EstimateAdjustmentType;
  depositValue?: NumericLike;
}) => {
  const totals = calculateEstimateDiscountTotals({
    subtotal,
    amountPaid,
    markupType,
    markupValue,
    discountType,
    discountValue,
    depositType,
    depositValue,
  });

  return {
    totalAmount: totals.totalAmount,
    balanceDue: totals.balanceDue,
    markupType: totals.markupType,
    markupValue: totals.markupValue,
    markupAmount: totals.markupAmount,
    discountType: totals.discountType,
    discountValue: totals.discountValue,
    discountAmount: totals.discountAmount,
    depositType: totals.depositType,
    depositValue: totals.depositValue,
    depositAmount: totals.depositAmount,
    finalAmount: totals.finalAmount,
  };
};

export const distributeEstimateDiscountAcrossServices = <T extends EstimateServiceLike>({
  services,
  markupType,
  markupValue,
  discountType,
  discountValue,
  depositType,
  depositValue,
  amountPaid,
}: {
  services: T[];
  markupType?: EstimateAdjustmentType;
  markupValue?: NumericLike;
  discountType?: EstimateDiscountType;
  discountValue?: NumericLike;
  depositType?: EstimateAdjustmentType;
  depositValue?: NumericLike;
  amountPaid?: NumericLike;
}) => {
  const normalizedServices = services.map((service) => {
    const quantity = getEstimateServiceQuantity(service);
    const originalUnitPrice = getEstimateServiceOriginalUnitPrice(service);
    const originalLineTotal = getEstimateServiceOriginalLineTotal(service);

    return {
      ...service,
      quantity,
      originalUnitPrice,
      originalLineTotal,
    };
  });

  const subtotal = round2(normalizedServices.reduce((sum, service) => sum + service.originalLineTotal, 0));
  const totals = calculateEstimateDiscountTotals({
    subtotal,
    amountPaid,
    markupType,
    markupValue,
    discountType,
    discountValue,
    depositType,
    depositValue,
  });

  if ((!totals.markupAmount && !totals.discountAmount) || subtotal <= 0) {
    return {
      totals,
      services: normalizedServices.map((service) => ({
        ...service,
        markupAmount: 0,
        discountAmount: 0,
        discountedLineTotal: round2(service.originalLineTotal),
        discountedUnitPrice: round6(service.originalUnitPrice),
        discountedPrice: round6(service.originalUnitPrice),
      })),
    };
  }

  let accumulatedMarkup = 0;
  let accumulatedDiscount = 0;

  const distributedServices = normalizedServices.map((service, index) => {
    const isLast = index === normalizedServices.length - 1;
    const proportionalMarkup = subtotal > 0 ? ((totals.markupAmount || 0) * service.originalLineTotal) / subtotal : 0;
    const markupAmount = isLast
      ? round2((totals.markupAmount || 0) - accumulatedMarkup)
      : round2(proportionalMarkup);
    accumulatedMarkup = round2(accumulatedMarkup + markupAmount);

    const markedUpLineTotal = round2(service.originalLineTotal + markupAmount);
    const discountBase = totals.subtotalWithMarkup || subtotal;
    const proportionalDiscount = discountBase > 0
      ? ((totals.discountAmount || 0) * markedUpLineTotal) / discountBase
      : 0;
    const discountAmount = isLast
      ? round2((totals.discountAmount || 0) - accumulatedDiscount)
      : round2(proportionalDiscount);

    accumulatedDiscount = round2(accumulatedDiscount + discountAmount);

    const discountedLineTotal = round2(Math.max(0, markedUpLineTotal - discountAmount));
    const discountedUnitPrice = round6(service.quantity > 0 ? discountedLineTotal / service.quantity : discountedLineTotal);

    return {
      ...service,
      markupAmount,
      discountAmount,
      discountedLineTotal,
      discountedUnitPrice,
      discountedPrice: discountedUnitPrice,
    };
  });

  return {
    totals,
    services: distributedServices,
  };
};

export const getEstimateEffectiveTotal = (estimate: {
  totalAmount?: NumericLike;
  finalAmount?: NumericLike;
  discountAmount?: NumericLike;
}) => {
  const totalAmount = estimate.totalAmount;
  const finalAmount = estimate.finalAmount;
  const discountAmount = toNumber(estimate.discountAmount, 0);

  if (
    discountAmount > 0 &&
    finalAmount !== undefined &&
    finalAmount !== null &&
    finalAmount !== "" &&
    toNumber(finalAmount) < toNumber(totalAmount ?? Number.MAX_SAFE_INTEGER)
  ) {
    return toNumber(finalAmount);
  }

  if (totalAmount !== undefined && totalAmount !== null && totalAmount !== "") {
    return toNumber(totalAmount);
  }

  return toNumber(finalAmount);
};





