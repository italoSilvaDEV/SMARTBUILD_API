import Jwt from 'jsonwebtoken';
import { androidBillingAccess } from './AndroidBillingAccess';
import { prisma } from '../utils/prisma';
import { verifyPendingToken } from '../controllers/mobile/MobileAuthController';
import { Request } from 'express';

jest.mock('../utils/prisma', () => ({ prisma: { userCompany: { findUnique: jest.fn() } } }));
jest.mock('../controllers/mobile/MobileAuthController', () => ({ verifyPendingToken: jest.fn() }));

describe('Android billing ownership', () => {
  beforeEach(() => { jest.clearAllMocks(); process.env.SECRET_JWT = 'test-secret'; });
  const req = (claims: object, companyId = 'company-a') => ({ body: { companyId }, headers: { authorization: `Bearer ${Jwt.sign(claims, 'test-secret')}` } } as Request);
  const membership = (name = 'Owner', isDisabled = false) => ({ user: { isDisabled }, office: { name }, company: { id: 'company-a' } });

  it('rejects signup and reset capabilities supplied as bearer sessions', async () => {
    await expect(androidBillingAccess(req({ id: 'owner', type: 'mobile_signup' }))).rejects.toMatchObject({ status: 401 });
    await expect(androidBillingAccess(req({ id: 'owner', purpose: 'reset' }))).rejects.toMatchObject({ status: 401 });
    expect(prisma.userCompany.findUnique).not.toHaveBeenCalled();
  });
  it('rejects another company, workers and disabled users', async () => {
    for (const value of [null, membership('Worker'), membership('Owner', true)]) {
      (prisma.userCompany.findUnique as jest.Mock).mockResolvedValue(value);
      await expect(androidBillingAccess(req({ id: 'owner' }))).rejects.toMatchObject({ status: 403 });
    }
  });
  it('resolves pending capabilities to the signed company, never the body company', async () => {
    (verifyPendingToken as jest.Mock).mockReturnValue({ userId: 'owner', companyId: 'company-a' });
    (prisma.userCompany.findUnique as jest.Mock).mockResolvedValue(membership());
    const result = await androidBillingAccess({ body: { pendingToken: 'capability', companyId: 'company-b' }, headers: {} } as Request);
    expect(result.companyId).toBe('company-a');
    expect(prisma.userCompany.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_companyId: { userId: 'owner', companyId: 'company-a' } } }));
  });
});
