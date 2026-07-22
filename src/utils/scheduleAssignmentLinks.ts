type AssignmentTarget = {
  service_project_id?: string | null;
  sub_service_project_id?: string | null;
  custom_service_schedule_id?: string | null;
};

const withCategory = (categoryId?: string | null) => (
  categoryId !== undefined ? { category_id: categoryId } : {}
);

export async function upsertUserAssignmentLink(
  db: any,
  userId: string,
  target: AssignmentTarget,
  categoryId?: string | null
) {
  const existing = await db.userServiceProject.findFirst({
    where: {
      user_id: userId,
      ...target,
    },
  });

  if (existing) {
    return db.userServiceProject.update({
      where: { id: existing.id },
      data: {
        removed_at: null,
        assigned_at: new Date(),
        ...withCategory(categoryId),
      },
    });
  }

  return db.userServiceProject.create({
    data: {
      user_id: userId,
      ...target,
      ...withCategory(categoryId),
    },
  });
}

export async function softRemoveUserAssignmentLinks(
  db: any,
  target: AssignmentTarget,
  userIds: string[]
) {
  if (userIds.length === 0) return { count: 0 };

  return db.userServiceProject.updateMany({
    where: {
      ...target,
      user_id: { in: userIds },
      removed_at: null,
    },
    data: { removed_at: new Date() },
  });
}

export async function upsertSubcontractorAssignmentLink(
  db: any,
  subcontractorId: string,
  target: AssignmentTarget,
  categoryId?: string | null
) {
  const existing = await db.subContractorServiceProject.findFirst({
    where: {
      subcontractor_id: subcontractorId,
      ...target,
    },
  });

  if (existing) {
    return db.subContractorServiceProject.update({
      where: { id: existing.id },
      data: {
        removed_at: null,
        ...withCategory(categoryId),
      },
    });
  }

  return db.subContractorServiceProject.create({
    data: {
      subcontractor_id: subcontractorId,
      ...target,
      ...withCategory(categoryId),
    },
  });
}

export async function softRemoveSubcontractorAssignmentLinks(
  db: any,
  target: AssignmentTarget,
  subcontractorIds: string[]
) {
  if (subcontractorIds.length === 0) return { count: 0 };

  return db.subContractorServiceProject.updateMany({
    where: {
      ...target,
      subcontractor_id: { in: subcontractorIds },
      removed_at: null,
    },
    data: { removed_at: new Date() },
  });
}
