import {
  extractTargetPricingInstruction,
  reconcileServicesToTarget,
} from "../../src/utils/smartBuilderPricing";

describe("SmartBuilder target pricing", () => {
  it("extracts the explicit contract target instead of the square-foot rate", () => {
    const instruction = extractTargetPricingInstruction([
      "Project: New Islamic Masumeen Center, 115 Wood Street, Hopkinton, Massachusetts",
      "Pricing basis: 24,857-SF preliminary gross takeoff * $250/SF",
      "Target all-in construction contract: $6,214,250",
    ].join("\n"));

    expect(instruction).toEqual({
      pricingIntent: "exact_total",
      targetTotal: 6_214_250,
      toleranceType: "exact",
      toleranceAmount: 1,
    });
  });

  it("does not treat an individual unit-price instruction as the estimate total", () => {
    const instruction = extractTargetPricingInstruction("Change the drywall unit price to $5.25 per sqft");

    expect(instruction.pricingIntent).toBe("standard");
    expect(instruction.targetTotal).toBeNull();
  });

  it("prefers the labeled target even when a per-unit rate appears later", () => {
    const instruction = extractTargetPricingInstruction(
      "Target total: $6,214,250 based on a rate of $250/SF"
    );

    expect(instruction.pricingIntent).toBe("exact_total");
    expect(instruction.targetTotal).toBe(6_214_250);
  });

  it("reconciles the reported seven service lines to the explicit target", () => {
    const services = [
      255_906.25,
      946_875,
      354_687.5,
      255_906.25,
      141_562.5,
      66_414.06,
      267_187.5,
    ].map((lineTotal, index) => ({
      name: `Service ${index + 1}`,
      quantity: 1,
      unitPrice: lineTotal,
      lineTotal,
    }));
    const instruction = extractTargetPricingInstruction("Target all-in construction contract: $6,214,250");

    const result = reconcileServicesToTarget(services, instruction);
    const total = Number(result.services
      .reduce((sum, service) => sum + Number(service.lineTotal), 0)
      .toFixed(2));

    expect(result.adjusted).toBe(true);
    expect(total).toBe(6_214_250);
    expect(result.proposedTotal).toBe(6_214_250);
    result.services.forEach((service) => {
      expect(service.lineTotal).toBe(service.quantity * service.unitPrice);
    });
  });

  it("keeps a proposal below a not-to-exceed cap unchanged", () => {
    const services = [{ quantity: 1, unitPrice: 80_000, lineTotal: 80_000 }];
    const instruction = extractTargetPricingInstruction("Do not exceed a total of $100,000");

    const result = reconcileServicesToTarget(services, instruction);

    expect(result.adjusted).toBe(false);
    expect(result.proposedTotal).toBe(80_000);
  });
});
