import { prisma } from '../utils/prisma';
import { userCanViewFinancials } from '../utils/financialAccess';

export class ProjectBudgetError extends Error {
  constructor(public code: 'INVALID_BUDGET' | 'BUDGET_CONFLICT') {
    super(code);
  }
}

export async function canAccessProjectBudget(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { company_id: true },
  });
  return !!project && await userCanViewFinancials(userId, project.company_id);
}

export function getProjectBudget(projectId: string) {
  return prisma.projectBudget.findUnique({ where: { projectId } });
}

export async function saveProjectBudget(projectId: string, userId: string, input: unknown) {
  let parsed: ReturnType<typeof parseBudget>;
  try {
    parsed = parseBudget(input);
  } catch {
    throw new ProjectBudgetError('INVALID_BUDGET');
  }
  try {
    return await prisma.$transaction(async tx => {
      if (parsed.revision === 0) {
        return tx.projectBudget.create({ data: {
          projectId, ...parsed.values, updatedBy: userId,
        } });
      }
      const updated = await tx.projectBudget.updateMany({
        where: { projectId, revision: parsed.revision },
        data: { ...parsed.values, updatedBy: userId, revision: { increment: 1 } },
      });
      if (!updated.count) throw new ProjectBudgetError('BUDGET_CONFLICT');
      return tx.projectBudget.findUniqueOrThrow({ where: { projectId } });
    });
  } catch (error) {
    // Two simultaneous first saves race on the project's unique key.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new ProjectBudgetError('BUDGET_CONFLICT');
    }
    throw error;
  }
}

export const budgetCategories = ['materials', 'employees', 'subcontractors'] as const;

export function parseBudget(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Invalid budget');
  const body = input as Record<string, unknown>;
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error('Invalid revision');
  const values: Record<typeof budgetCategories[number], string | null> = {
    materials: null, employees: null, subcontractors: null,
  };
  for (const key of budgetCategories) {
    const value = body[key];
    if (value === null) continue;
    // Canonical decimal strings avoid ambiguous locale separators and float rounding.
    if (typeof value !== 'string' || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) {
      throw new Error('Invalid amount');
    }
    values[key] = value;
  }
  return { revision: Number(body.revision), values };
}
