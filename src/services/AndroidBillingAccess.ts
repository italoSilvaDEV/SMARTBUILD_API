import { Request } from 'express';
import Jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { verifyPendingToken } from '../controllers/mobile/MobileAuthController';

export class AndroidBillingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** A signup capability can only access its own company's billing, never a session API. */
export async function androidBillingAccess(req: Request) {
  let userId: string;
  let companyId: string;
  try {
    if (req.body.pendingToken) {
      ({ userId, companyId } = verifyPendingToken(req.body.pendingToken));
    } else {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token || !process.env.SECRET_JWT) throw new Error();
      const claims = Jwt.verify(token, process.env.SECRET_JWT, { algorithms: ['HS256'] });
      if (typeof claims === 'string' || claims.type || claims.purpose) throw new Error();
      userId = claims.id || claims.sub;
      companyId = req.body.companyId;
      if (typeof userId !== 'string' || typeof companyId !== 'string') throw new Error();
    }
  } catch { throw new AndroidBillingError(401, 'Sign in again to manage your subscription.'); }
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: { user: true, office: true, company: true },
  });
  if (!membership || membership.user.isDisabled || !['Owner', 'Administrator'].includes(membership.office.name)) {
    throw new AndroidBillingError(403, 'Only a company owner or administrator can manage billing.');
  }
  return { userId, companyId, company: membership.company };
}
