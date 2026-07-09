import {
  buildEstimateFinancialFields,
  distributeEstimateDiscountAcrossServices,
  getEstimateServiceQuantity,
} from "./estimateDiscount";

type SyncEstimateService = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: any;
  lineTotal: any;
  originalUnitPrice: any;
  originalLineTotal: any;
  notes: string | null;
  id_service: string | null;
  hours: any;
  price: any;
  start_date: string | null;
  deadline: string | null;
  pos: number;
};

export const syncEstimateDiscountedServices = async (smartbuild: any, estimateId: string) => {
  const estimate = await smartbuild.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      status: true,
      type_estimate: true,
      projectId: true,
      amountPaid: true,
      markupType: true,
      markupValue: true,
      discountType: true,
      discountValue: true,
      depositType: true,
      depositValue: true,
      project: {
        select: {
          company_id: true,
        },
      },
      serviceProjects: {
        orderBy: [
          { pos: "asc" },
          { date_creation: "asc" },
          { id: "asc" },
        ],
        select: {
          id: true,
          name: true,
          description: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          originalUnitPrice: true,
          originalLineTotal: true,
          notes: true,
          id_service: true,
          hours: true,
          price: true,
          start_date: true,
          deadline: true,
          pos: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new Error("Estimate not found");
  }

  const services = estimate.serviceProjects as SyncEstimateService[];

  const shouldSyncToProject =
    estimate.status === "approved" &&
    estimate.type_estimate === "estimateProject" &&
    !!estimate.projectId;

  const distributed = distributeEstimateDiscountAcrossServices<SyncEstimateService>({
    services,
    markupType: estimate.markupType,
    markupValue: estimate.markupValue,
    discountType: estimate.discountType,
    discountValue: estimate.discountValue,
    depositType: estimate.depositType,
    depositValue: estimate.depositValue,
    amountPaid: estimate.amountPaid,
  });

  for (let index = 0; index < services.length; index += 1) {
    const originalService = services[index];
    const discountedService = distributed.services[index];
    const hours = originalService.hours ?? getEstimateServiceQuantity(originalService);
    const price = discountedService.discountedPrice;

    await smartbuild.estimateServiceProject.update({
      where: { id: originalService.id },
      data: {
        name: originalService.name,
        description: originalService.description ?? "",
        quantity: originalService.quantity,
        unitPrice: discountedService.discountedUnitPrice,
        lineTotal: discountedService.discountedLineTotal,
        originalUnitPrice: discountedService.originalUnitPrice,
        originalLineTotal: discountedService.originalLineTotal,
        notes: originalService.notes ?? null,
        id_service: originalService.id_service ?? null,
        hours,
        price,
        start_date: originalService.start_date ?? null,
        deadline: originalService.deadline ?? null,
        pos: originalService.pos,
      },
    });

    if (shouldSyncToProject) {
      const siblingData = {
        projectId: estimate.projectId,
        company_id: estimate.project?.company_id ?? null,
        estimateServiceId: originalService.id,
        name: originalService.name,
        description: originalService.description ?? "",
        id_service: originalService.id_service ?? null,
        hours,
        price,
        start_date: originalService.start_date ?? null,
        deadline: originalService.deadline ?? null,
      };

      const siblingProject = await smartbuild.serviceProject.findFirst({
        where: {
          estimateServiceId: originalService.id,
        },
      });

      if (siblingProject) {
        await smartbuild.serviceProject.update({
          where: { id: siblingProject.id },
          data: siblingData,
        });
      } else {
        await smartbuild.serviceProject.create({
          data: siblingData,
        });
      }
    }
  }

  const financialFields = buildEstimateFinancialFields({
    subtotal: distributed.totals.subtotal,
    amountPaid: estimate.amountPaid,
    markupType: estimate.markupType,
    markupValue: estimate.markupValue,
    discountType: estimate.discountType,
    discountValue: estimate.discountValue,
    depositType: estimate.depositType,
    depositValue: estimate.depositValue,
  });

  await smartbuild.estimate.update({
    where: { id: estimate.id },
    data: {
      totalAmount: financialFields.totalAmount,
      balanceDue: financialFields.balanceDue,
      markupType: financialFields.markupType,
      markupValue: financialFields.markupValue,
      markupAmount: financialFields.markupAmount,
      discountType: financialFields.discountType,
      discountValue: financialFields.discountValue,
      discountAmount: financialFields.discountAmount,
      depositType: financialFields.depositType,
      depositValue: financialFields.depositValue,
      depositAmount: financialFields.depositAmount,
      finalAmount: financialFields.finalAmount,
    },
  });

  return {
    estimateId: estimate.id,
    totals: distributed.totals,
  };
};

