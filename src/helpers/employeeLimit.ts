import { Prisma } from "@prisma/client";
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
  options: { excludeUserId?: string; isMultiCompany?: boolean; onlyPlanSeats?: boolean; db?: Prisma.TransactionClient } = {}
): Promise<number> {
  const isMultiCompany = options.isMultiCompany ?? (await isMultiCompanyEnabled());

  const where: any = options.db
    ? { OR: [{ company_id: companyId }, { companies: { some: { companyId } } }] }
    : isMultiCompany
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

  return (options.db ?? prisma).user.count({ where });
}

// Missing company must not turn an authorization/allocation failure into a free seat.
export async function assertEmployeeSeatAvailable(
  companyId: string,
  options: { excludeUserId?: string; isMultiCompany?: boolean; db?: Prisma.TransactionClient } = {}
): Promise<void> {
  const company = await (options.db ?? prisma).company.findUnique({
    where: { id: companyId },
    select: { allowedEmployees: true, extraEmployees: true },
  });
  if (!company) throw new Error("Company not found");

  const maxEmployees = (company.allowedEmployees || 0) + (company.extraEmployees || 0);
  const activeCount = await countActiveEmployees(companyId, options);

  if (activeCount >= maxEmployees) {
    throw new EmployeeLimitError(maxEmployees);
  }
}

// Lock in stable order so reactivating a multi-company user cannot overbook any company.
// Callers keep mail, uploads and provider calls outside this transaction.
export async function withEmployeeSeatTransaction<T>(
  companyIds: string[],
  options: { excludeUserId?: string; isMultiCompany: boolean; lockUserId?: string },
  write: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!companyIds.length || companyIds.some(id => !id)) throw new Error('Company is required');
  return prisma.$transaction(async db => {
    const allIds = new Set(companyIds);
    let alreadyActive = false;
    const lockUserId = options.lockUserId ?? options.excludeUserId;
    if (lockUserId) {
      const users = await db.$queryRaw<Array<{ id: string; isDisabled: boolean | null; company_id: string | null }>>(Prisma.sql`SELECT id, isDisabled, company_id FROM User WHERE id = ${lockUserId} FOR UPDATE`);
      if (!users.length) throw new Error('User not found');
      if (options.excludeUserId) {
        alreadyActive = !users[0].isDisabled;
        const links = await db.userCompany.findMany({ where: { userId: lockUserId }, select: { companyId: true } });
        links.forEach(link => allIds.add(link.companyId));
        if (users[0].company_id) allIds.add(users[0].company_id);
      }
    }
    const ids = [...allIds].sort();
    for (const id of ids) {
      const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM Company WHERE id = ${id} FOR UPDATE`);
      if (!rows.length) throw new Error('Company not found');
    }
    if (!alreadyActive) for (const id of ids) await assertEmployeeSeatAvailable(id, { ...options, db });
    return write(db);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
