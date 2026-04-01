export type EstimateDiscountType = "fixed" | "percentage" | null | undefined;

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
  discountType,
  discountValue,
}: {
  subtotal: NumericLike;
  amountPaid?: NumericLike;
  discountType?: EstimateDiscountType;
  discountValue?: NumericLike;
}) => {
  const normalizedSubtotal = round2(Math.max(0, toNumber(subtotal, 0)));
  const normalizedAmountPaid = round2(Math.max(0, toNumber(amountPaid, 0)));
  const normalizedType = normalizeEstimateDiscountType(discountType);
  const rawDiscountValue = round2(Math.max(0, toNumber(discountValue, 0)));

  if (!normalizedType || rawDiscountValue <= 0) {
    return {
      subtotal: normalizedSubtotal,
      amountPaid: normalizedAmountPaid,
      discountType: null as EstimateDiscountType,
      discountValue: null as number | null,
      discountAmount: null as number | null,
      totalAmount: normalizedSubtotal,
      finalAmount: normalizedSubtotal,
      balanceDue: round2(Math.max(0, normalizedSubtotal - normalizedAmountPaid)),
    };
  }

  if (normalizedType === "percentage" && rawDiscountValue > 100) {
    throw new Error("Percentage discount cannot be greater than 100");
  }

  if (normalizedType === "fixed" && rawDiscountValue > normalizedSubtotal) {
    throw new Error("Fixed discount cannot be greater than estimate subtotal");
  }

  const computedDiscountAmount = normalizedType === "percentage"
    ? round2((normalizedSubtotal * rawDiscountValue) / 100)
    : round2(rawDiscountValue);

  const discountedTotal = round2(Math.max(0, normalizedSubtotal - computedDiscountAmount));

  if (discountedTotal < normalizedAmountPaid) {
    throw new Error("Discount cannot be greater than the remaining balance");
  }

  return {
    subtotal: normalizedSubtotal,
    amountPaid: normalizedAmountPaid,
    discountType: normalizedType,
    discountValue: rawDiscountValue,
    discountAmount: computedDiscountAmount,
    totalAmount: discountedTotal,
    finalAmount: discountedTotal,
    balanceDue: round2(Math.max(0, discountedTotal - normalizedAmountPaid)),
  };
};

export const buildEstimateFinancialFields = ({
  subtotal,
  amountPaid,
  discountType,
  discountValue,
}: {
  subtotal: NumericLike;
  amountPaid?: NumericLike;
  discountType?: EstimateDiscountType;
  discountValue?: NumericLike;
}) => {
  const totals = calculateEstimateDiscountTotals({ subtotal, amountPaid, discountType, discountValue });

  return {
    totalAmount: totals.totalAmount,
    balanceDue: totals.balanceDue,
    discountType: totals.discountType,
    discountValue: totals.discountValue,
    discountAmount: totals.discountAmount,
    finalAmount: totals.finalAmount,
  };
};

export const distributeEstimateDiscountAcrossServices = <T extends EstimateServiceLike>({
  services,
  discountType,
  discountValue,
  amountPaid,
}: {
  services: T[];
  discountType?: EstimateDiscountType;
  discountValue?: NumericLike;
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
    discountType,
    discountValue,
  });

  if (!totals.discountAmount || subtotal <= 0) {
    return {
      totals,
      services: normalizedServices.map((service) => ({
        ...service,
        discountAmount: 0,
        discountedLineTotal: round2(service.originalLineTotal),
        discountedUnitPrice: round6(service.originalUnitPrice),
        discountedPrice: round6(service.originalUnitPrice),
      })),
    };
  }

  let accumulatedDiscount = 0;

  const distributedServices = normalizedServices.map((service, index) => {
    const isLast = index === normalizedServices.length - 1;
    const proportionalDiscount = subtotal > 0 ? (totals.discountAmount! * service.originalLineTotal) / subtotal : 0;
    const discountAmount = isLast
      ? round2(totals.discountAmount! - accumulatedDiscount)
      : round2(proportionalDiscount);

    accumulatedDiscount = round2(accumulatedDiscount + discountAmount);

    const discountedLineTotal = round2(Math.max(0, service.originalLineTotal - discountAmount));
    const discountedUnitPrice = round6(service.quantity > 0 ? discountedLineTotal / service.quantity : discountedLineTotal);

    return {
      ...service,
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




