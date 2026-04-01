import { buildEstimateFinancialFields, distributeEstimateDiscountAcrossServices, getEstimateServiceQuantity } from "./estimateDiscount";

export const syncEstimateDiscountedServices = async (smartbuild: any, estimateId: string) => {
  const estimate = await smartbuild.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      status: true,
      type_estimate: true,
      projectId: true,
      amountPaid: true,
      discountType: true,
      discountValue: true,
      project: {
        select: {
          company_id: true,
        },
      },
      serviceProjects: {
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
        },
      },
    },
  });

  if (!estimate) {
    throw new Error("Estimate not found");
  }

  const shouldSyncToProject =
    estimate.status === "approved" &&
    estimate.type_estimate === "estimateProject" &&
    !!estimate.projectId;

  const distributed = distributeEstimateDiscountAcrossServices({
    services: estimate.serviceProjects,
    discountType: estimate.discountType,
    discountValue: estimate.discountValue,
    amountPaid: estimate.amountPaid,
  });

  for (const service of distributed.services) {
    const hours = service.hours ?? getEstimateServiceQuantity(service);
    const price = service.discountedPrice;

    await smartbuild.estimateServiceProject.update({
      where: { id: service.id },
      data: {
        name: service.name,
        description: service.description ?? "",
        quantity: service.quantity,
        unitPrice: service.discountedUnitPrice,
        lineTotal: service.discountedLineTotal,
        originalUnitPrice: service.originalUnitPrice,
        originalLineTotal: service.originalLineTotal,
        notes: service.notes ?? null,
        id_service: service.id_service ?? null,
        hours,
        price,
        start_date: service.start_date ?? null,
        deadline: service.deadline ?? null,
      },
    });

    if (shouldSyncToProject) {
      const siblingData = {
        projectId: estimate.projectId,
        company_id: estimate.project?.company_id ?? null,
        estimateServiceId: service.id,
        name: service.name,
        description: service.description ?? "",
        id_service: service.id_service ?? null,
        hours,
        price,
        start_date: service.start_date ?? null,
        deadline: service.deadline ?? null,
      };

      const siblingProject = await smartbuild.serviceProject.findFirst({
        where: {
          estimateServiceId: service.id,
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

  const subtotal = distributed.services.reduce((sum, service) => sum + Number(service.originalLineTotal ?? 0), 0);
  const financialFields = buildEstimateFinancialFields({
    subtotal,
    amountPaid: estimate.amountPaid,
    discountType: estimate.discountType,
    discountValue: estimate.discountValue,
  });

  await smartbuild.estimate.update({
    where: { id: estimate.id },
    data: {
      totalAmount: financialFields.totalAmount,
      balanceDue: financialFields.balanceDue,
      discountType: financialFields.discountType,
      discountValue: financialFields.discountValue,
      discountAmount: financialFields.discountAmount,
      finalAmount: financialFields.finalAmount,
    },
  });

  return {
    estimateId: estimate.id,
    totals: distributed.totals,
  };
};
