export async function syncQboProjectFinancialsFromServices(
  tx: any,
  projectId: string
) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      amountPaid: true,
      serviceProject: {
        select: {
          hours: true,
          price: true,
        },
      },
    },
  });

  if (!project) return null;

  const price = project.serviceProject.reduce((total: number, service: any) => {
    return total + Number(service.hours || 0) * Number(service.price || 0);
  }, 0);

  const amountPaid = Number(project.amountPaid || 0);
  const balanceDue = price - amountPaid;

  return tx.project.update({
    where: { id: projectId },
    data: {
      price,
      balanceDue,
    },
  });
}
