import { prisma } from "../utils/prisma";
import { isMultiCompanyEnabled } from "./featureToggle";

export class EmployeeLimitError extends Error {
  maxEmployees: number;

  constructor(maxEmployees: number) {
    super(
      `Unable to create new user. Company has reached the maximum number of employees allowed (${maxEmployees}).`
    );
    this.name = "EmployeeLimitError";
    this.maxEmployees = maxEmployees;
  }
}

// Prisma filter for active users (isDisabled is nullable: NULL counts as active)
export const activeUserFilter = { OR: [{ isDisabled: false }, { isDisabled: null }] };

// Disabled users do not occupy a seat; only active ones (isDisabled = false) count.
export async function countActiveEmployees(
  companyId: string,
  options: { excludeUserId?: string; isMultiCompany?: boolean; onlyPlanSeats?: boolean } = {}
): Promise<number> {
  const isMultiCompany = options.isMultiCompany ?? (await isMultiCompanyEnabled());

  const where: any = isMultiCompany
    ? { companies: { some: { companyId } } }
    : { company_id: companyId };

  // isDisabled / isExtraPaidUser are nullable: NULL must count as false, so match it explicitly
  const and: any[] = [{ OR: [{ isDisabled: false }, { isDisabled: null }] }];
  if (options.onlyPlanSeats) {
    and.push({ OR: [{ isExtraPaidUser: false }, { isExtraPaidUser: null }] });
  }
  where.AND = and;
  if (options.excludeUserId) {
    where.id = { not: options.excludeUserId };
  }

  return prisma.user.count({ where });
}

// Throws EmployeeLimitError when there is no free seat. Does nothing if the company does not exist.
export async function assertEmployeeSeatAvailable(
  companyId: string,
  options: { excludeUserId?: string; isMultiCompany?: boolean } = {}
): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { allowedEmployees: true, extraEmployees: true },
  });
  if (!company) return;

  const maxEmployees = (company.allowedEmployees || 0) + (company.extraEmployees || 0);
  const activeCount = await countActiveEmployees(companyId, options);

  if (activeCount >= maxEmployees) {
    throw new EmployeeLimitError(maxEmployees);
  }
}
