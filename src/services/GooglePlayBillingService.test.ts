import { GooglePlayBillingService, UNRESOLVED_PARKED_UNTIL } from './GooglePlayBillingService';
import { googleCompanyAccountId } from './GooglePlayPurchase';
import { ensureCompanyPlanSetup } from './MobilePlanSetup';
jest.mock('../utils/prisma', () => ({ prisma: {} }));
jest.mock('./MobilePlanSetup', () => ({ ensureCompanyPlanSetup: jest.fn() }));
const receipt = (state = 'ACTIVE'): any => ({ subscriptionState: 'SUBSCRIPTION_STATE_' + state, startTime: '2026-01-01T00:00:00Z', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', externalAccountIdentifiers: { obfuscatedExternalAccountId: googleCompanyAccountId('company') }, lineItems: [{ productId: 'starter', offerDetails: { basePlanId: 'monthly' }, expiryTime: '2099-01-01T00:00:00Z', latestSuccessfulOrderId: 'order', autoRenewingPlan: { autoRenewEnabled: true } }] });
let db: any, gateway: any, env: any, service: GooglePlayBillingService, ledger: any, events: string[];
beforeEach(() => {
    jest.clearAllMocks();
    events = [];
    ledger = { id: 'ledger', companyId: null, retired: false };
    db = { googlePlayPurchaseSync: { upsert: jest.fn(async () => ledger), updateMany: jest.fn(async ({ data }: any) => { Object.assign(ledger, data); return { count: 1 }; }), findUniqueOrThrow: jest.fn(async () => ledger), findUnique: jest.fn(async () => null), update: jest.fn(async ({ data }: any) => Object.assign(ledger, data)), findMany: jest.fn(async () => []) },
        user: { findUnique: jest.fn(async () => ({ company_id: 'company', office: { name: 'Owner' }, companies: [] })) },
        subscription: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => { events.push('persist'); return { id: 'sub', ...data }; }), update: jest.fn(async ({ data }: any) => ({ id: 'sub', ...data })), findMany: jest.fn(async () => []) },
        plan: { findUnique: jest.fn(async () => ({ id: 'plan', allowedEmployees: 2, permissionGroup: { GroupPermissionsList: [] } })) }, company: { update: jest.fn() }, $queryRaw: jest.fn(), $transaction: jest.fn(async (fn) => { const result = await fn(db); events.push('commit'); return result; }) };
    gateway = { get: jest.fn(async () => receipt()), acknowledge: jest.fn(async () => { events.push('ack'); }), verifyPush: jest.fn(async () => ({ email: 'push@test', email_verified: true, iss: 'https://accounts.google.com' })) };
    env = { GOOGLE_PLAY_NATIVE_ENABLED: 'true', GOOGLE_PLAY_PACKAGE_NAME: 'package', GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES: 'true', ANDROID_BILLING_PLAN_MAPPINGS: JSON.stringify([{ productId: 'starter', basePlanId: 'monthly', planId: 'plan' }]), GOOGLE_PLAY_PUBSUB_AUDIENCE: 'aud', GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT: 'push@test' };
    service = new GooglePlayBillingService(db, gateway, env);
});
const sync = () => service.sync({ token: 'secret-purchase', companyId: 'company', actorId: 'actor' });
test('confirmed purchase persists atomically before ack', async () => { expect((await sync()).active).toBe(true); expect(events).toEqual(['persist', 'commit', 'ack']); expect(ensureCompanyPlanSetup).toHaveBeenCalledWith('company', expect.objectContaining({ id: 'plan' }), db); });
test('pending purchase is durable without granting or acknowledging', async () => { gateway.get.mockResolvedValue(receipt('PENDING')); expect((await sync()).pending).toBe(true); expect(db.subscription.create).not.toHaveBeenCalled(); expect(ensureCompanyPlanSetup).not.toHaveBeenCalled(); expect(gateway.acknowledge).not.toHaveBeenCalled(); expect(ledger.companyId).toBe('company'); });
test('repeated token updates same subscription', async () => { db.subscription.findUnique.mockResolvedValue({ id: 'sub', companyId: 'company', billingProvider: 'google' }); await sync(); expect(db.subscription.create).not.toHaveBeenCalled(); expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sub' } })); });
test('worker cannot claim a company purchase', async () => { db.user.findUnique.mockResolvedValue({ company_id: 'company', office: { name: 'Worker' }, companies: [] }); await expect(sync()).rejects.toThrow('GOOGLE_COMPANY_AUTHORITY_REQUIRED'); expect(gateway.get).not.toHaveBeenCalled(); });
test('token cannot be claimed across companies', async () => { db.subscription.findUnique.mockResolvedValue({ id: 'sub', companyId: 'other', billingProvider: 'google' }); await expect(sync()).rejects.toThrow('GOOGLE_COMPANY_MISMATCH'); expect(db.$transaction).not.toHaveBeenCalled(); expect(gateway.acknowledge).not.toHaveBeenCalled(); });
test.each(['stripe', 'apple', 'google'])('existing %s active contract is not overwritten', async (billingProvider) => { db.subscription.findFirst.mockResolvedValue({ id: 'other', billingProvider }); await expect(sync()).rejects.toThrow('GOOGLE_OTHER_SUBSCRIPTION_ACTIVE'); expect(db.subscription.create).not.toHaveBeenCalled(); expect(ensureCompanyPlanSetup).not.toHaveBeenCalled(); expect(gateway.acknowledge).not.toHaveBeenCalled(); });
test('valid FREE grant does not refuse an already paid Google purchase', async () => { db.subscription.findFirst.mockImplementation(async ({ where }: any) => where.NOT?.plan?.validityType === 'FREE' && !where.NOT.endDate ? null : { id: 'trial', billingProvider: 'stripe' }); expect((await sync()).active).toBe(true); expect(db.subscription.create).toHaveBeenCalled(); expect(gateway.acknowledge).toHaveBeenCalled(); });
const foreignRow = (isActive: boolean) => ({ billingProvider: 'stripe', isActive, paymentFailed: false, endDate: new Date('2026-01-01'), stripeSubscriptionCanceled: false, appleBillingStatus: null, plan: { validityType: 'MONTHLY' } });
const useForeignRows = (rows: any[]) => db.subscription.findMany.mockImplementation(async ({ where }: any) => rows.filter(item => where.isActive === undefined || item.isActive === where.isActive));
test('inactive Stripe history does not refuse a paid Google purchase', async () => { useForeignRows([foreignRow(false)]); expect((await sync()).active).toBe(true); expect(gateway.acknowledge).toHaveBeenCalled(); });
test('live Stripe contract still refuses the Google purchase', async () => { useForeignRows([foreignRow(true)]); await expect(sync()).rejects.toThrow('GOOGLE_PROVIDER_CONFLICT_STRIPE'); expect(db.subscription.create).not.toHaveBeenCalled(); expect(gateway.acknowledge).not.toHaveBeenCalled(); });
test('sandbox is rejected outside dedicated companies', async () => { gateway.get.mockResolvedValue({ ...receipt(), testPurchase: {} }); await expect(sync()).rejects.toThrow('GOOGLE_TEST_COMPANY_REQUIRED'); expect(db.$transaction).not.toHaveBeenCalled(); });
test('live purchases require explicit release config', async () => { env.GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES = 'false'; await expect(sync()).rejects.toThrow('GOOGLE_LIVE_PURCHASES_DISABLED'); });
test('native flag disabled does not query Google or DB', async () => { env.GOOGLE_PLAY_NATIVE_ENABLED = 'false'; await expect(sync()).rejects.toThrow('GOOGLE_NATIVE_DISABLED'); expect(db.googlePlayPurchaseSync.upsert).not.toHaveBeenCalled(); });
// HML and production share one Play app and RTDN topic: each receives the other's tokens.
describe('token whose company cannot be identified', () => {
    test('is parked instead of retried every minute', async () => {
        await expect(service.sync({ token: 'other-environment' })).rejects.toThrow('GOOGLE_OWNER_UNRESOLVED');
        expect(ledger).toMatchObject({ lastErrorCode: 'GOOGLE_OWNER_UNRESOLVED', nextAttemptAt: UNRESOLVED_PARKED_UNTIL, leaseId: null, lockedUntil: null });
        expect(db.subscription.create).not.toHaveBeenCalled();
        expect(gateway.acknowledge).not.toHaveBeenCalled();
    });
    test('is still processed when the app verifies the purchase for its company', async () => {
        await expect(service.sync({ token: 'secret-purchase' })).rejects.toThrow('GOOGLE_OWNER_UNRESOLVED');
        expect((await sync()).active).toBe(true);
        expect(ledger).toMatchObject({ companyId: 'company', lastErrorCode: null });
        expect(ledger.nextAttemptAt.getTime()).toBeLessThan(UNRESOLVED_PARKED_UNTIL.getTime());
    });
    test('a new notification for the token puts it back in the queue', async () => {
        const data = Buffer.from(JSON.stringify({ packageName: 'package', subscriptionNotification: { purchaseToken: 'other-environment' } })).toString('base64');
        await service.receivePush('Bearer token', { message: { data } });
        expect(db.googlePlayPurchaseSync.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { nextAttemptAt: expect.any(Date) } }));
        const requeued = (db.googlePlayPurchaseSync.upsert.mock.calls[0][0] as any).update.nextAttemptAt as Date;
        expect(requeued.getTime()).toBeLessThanOrEqual(Date.now());
    });
    test('other failures keep the one-minute retry', async () => {
        gateway.get.mockRejectedValue(new Error('google unavailable'));
        const before = Date.now();
        await expect(sync()).rejects.toThrow('GOOGLE_SYNC_FAILED');
        expect(ledger.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 60000);
        expect(ledger.nextAttemptAt.getTime()).toBeLessThan(before + 120000);
    });
});
test('ack failure persists safe retry after entitlement commit', async () => { gateway.acknowledge.mockRejectedValue(new Error('secret-purchase and credential')); await expect(sync()).rejects.toThrow('GOOGLE_SYNC_FAILED'); expect(events).toEqual(['persist', 'commit']); expect(ledger.lastErrorCode).toBe('GOOGLE_SYNC_FAILED'); expect(JSON.stringify(ledger)).not.toContain('credential'); });
test('failed DB transaction never acknowledges', async () => { db.$transaction.mockRejectedValue(new Error('db')); await expect(sync()).rejects.toThrow('GOOGLE_SYNC_FAILED'); expect(gateway.acknowledge).not.toHaveBeenCalled(); });
test('competing lease fails before Google lookup', async () => { db.googlePlayPurchaseSync.updateMany.mockResolvedValue({ count: 0 }); await expect(sync()).rejects.toThrow('GOOGLE_SYNC_BUSY'); expect(gateway.get).not.toHaveBeenCalled(); });
test('stale worker cannot overwrite newer verification', async () => { db.googlePlayPurchaseSync.findUniqueOrThrow.mockResolvedValue({ leaseId: 'new-worker' }); await expect(sync()).rejects.toThrow('GOOGLE_LEASE_SUPERSEDED'); expect(db.subscription.create).not.toHaveBeenCalled(); });
test('retired token can never reactivate its older contract', async () => { ledger.retired = true; await expect(sync()).rejects.toThrow('GOOGLE_TOKEN_REPLACED'); expect(gateway.get).not.toHaveBeenCalled(); });
test.each(['ON_HOLD', 'PAUSED', 'EXPIRED'])('%s updates only Google contract and revokes access', async (state) => { gateway.get.mockResolvedValue(receipt(state)); db.subscription.findUnique.mockResolvedValue({ id: 'sub', companyId: 'company', billingProvider: 'google' }); expect((await sync()).active).toBe(false); expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub' }, data: expect.objectContaining({ isActive: false, billingProvider: 'google' }) }); expect(ensureCompanyPlanSetup).not.toHaveBeenCalled(); expect(gateway.acknowledge).not.toHaveBeenCalled(); });
const push = (payload: any) => ({ message: { data: Buffer.from(JSON.stringify({ packageName: 'package', ...payload })).toString('base64') } });
test('authenticated RTDN queues token without trusting notification state', async () => { await service.receivePush('Bearer jwt', push({ subscriptionNotification: { purchaseToken: 'token', notificationType: 13 } })); expect(db.googlePlayPurchaseSync.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { purchaseToken: 'token' } })); expect(gateway.get).not.toHaveBeenCalled(); expect(db.subscription.update).not.toHaveBeenCalled(); });
test.each([undefined, 'wrong', 'Bearer bad'])('untrusted push auth %s rejected', async (authorization) => { gateway.verifyPush.mockRejectedValue(new Error('bad')); await expect(service.receivePush(authorization, push({ testNotification: {} }))).rejects.toThrow('GOOGLE_PUSH_UNAUTHORIZED'); expect(db.googlePlayPurchaseSync.upsert).not.toHaveBeenCalled(); });
test('push auth mandatory even outside production', async () => { delete env.GOOGLE_PLAY_PUBSUB_AUDIENCE; await expect(service.receivePush('Bearer jwt', push({ testNotification: {} }))).rejects.toThrow('GOOGLE_PUSH_CONFIG_MISSING'); });
test.each([{ email: 'other', email_verified: true, iss: 'accounts.google.com' }, { email: 'push@test', email_verified: false, iss: 'accounts.google.com' }, { email: 'push@test', email_verified: true, iss: 'evil' }])('rejects mismatched OIDC identity %j', async (identity) => { gateway.verifyPush.mockResolvedValue(identity); await expect(service.receivePush('Bearer jwt', push({ testNotification: {} }))).rejects.toThrow('GOOGLE_PUSH_UNAUTHORIZED'); });
test('wrong package and malformed payload cannot queue', async () => { await expect(service.receivePush('Bearer jwt', push({ packageName: 'other', testNotification: {} }))).rejects.toThrow('GOOGLE_PACKAGE_MISMATCH'); await expect(service.receivePush('Bearer jwt', { message: { data: 'garbage' } })).rejects.toThrow('GOOGLE_PUSH_INVALID'); expect(db.googlePlayPurchaseSync.upsert).not.toHaveBeenCalled(); });
test('console test notification returns success without changing subscriptions', async () => { expect(await service.receivePush('Bearer jwt', push({ testNotification: {} }))).toEqual({ received: true, test: true }); expect(db.subscription.create).not.toHaveBeenCalled(); });
test('successful replacement retires old token only after confirmed new entitlement', async () => {
    gateway.get.mockResolvedValue({ ...receipt(), linkedPurchaseToken: 'old-token' });
    db.subscription.findUnique.mockImplementation(async ({ where }: any) => where.googlePurchaseToken === 'old-token' ? { id: 'old-sub', companyId: 'company', billingProvider: 'google', isActive: true } : null);
    await sync();
    expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: 'old-sub' }, data: { isActive: false } });
    expect(db.googlePlayPurchaseSync.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { purchaseToken: 'old-token' }, update: expect.objectContaining({ retired: true }) }));
});
test('pending replacement preserves paid predecessor', async () => {
    gateway.get.mockResolvedValue({ ...receipt('PENDING'), linkedPurchaseToken: 'old-token' });
    db.subscription.findUnique.mockResolvedValue({ id: 'old-sub', companyId: 'company', billingProvider: 'google', isActive: true });
    await sync();
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(gateway.acknowledge).not.toHaveBeenCalled();
});
test('ack retry is idempotent and completes the same contract', async () => {
    gateway.acknowledge.mockRejectedValueOnce(new Error('temporary'));
    await expect(sync()).rejects.toThrow('GOOGLE_SYNC_FAILED');
    db.subscription.findUnique.mockResolvedValue({ id: 'sub', companyId: 'company', billingProvider: 'google' });
    await sync();
    expect(db.subscription.create).toHaveBeenCalledTimes(1);
    expect(gateway.acknowledge).toHaveBeenCalledTimes(2);
    expect(ledger.lastErrorCode).toBeNull();
    expect(ledger.acknowledgedAt).toBeInstanceOf(Date);
});
test('unacknowledged expired purchase is not recorded as acknowledged', async () => { gateway.get.mockResolvedValue(receipt('EXPIRED')); await sync(); expect(ledger.acknowledgedAt).toBeUndefined(); });
test('old cancellation notification reconciles current active Google state', async () => {
    ledger.companyId = 'company';
    db.googlePlayPurchaseSync.findMany.mockResolvedValue([{ purchaseToken: 'secret-purchase' }]);
    await service.receivePush('Bearer jwt', push({ subscriptionNotification: { purchaseToken: 'secret-purchase', notificationType: 13 } }));
    expect(await service.reconcile()).toEqual({ scanned: 1, updated: 1, failed: 0 });
    expect(db.subscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isActive: true }) });
});
test('recovery clears hold flags on the same subscription', async () => { db.subscription.findUnique.mockResolvedValue({ id: 'sub', companyId: 'company', billingProvider: 'google', paymentFailed: true, isActive: false }); await sync(); expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub' }, data: expect.objectContaining({ isActive: true, paymentFailed: false }) }); });
test('unknown token from RTDN remains queued until company claim', async () => { await expect(service.sync({ token: 'unclaimed' })).rejects.toThrow('GOOGLE_OWNER_UNRESOLVED'); expect(ledger.lastErrorCode).toBe('GOOGLE_OWNER_UNRESOLVED'); expect(db.subscription.create).not.toHaveBeenCalled(); });

test('MySQL first-delivery unique race reuses the committed ledger',async()=>{db.googlePlayPurchaseSync.upsert.mockRejectedValueOnce({code:'P2002'});expect((await sync()).active).toBe(true);expect(db.subscription.create).toHaveBeenCalledTimes(1);});

test.each(['stripe','apple'])('inactive %s recoverable contract cannot be replaced by a Google receipt',async billingProvider=>{
 db.subscription.findMany.mockResolvedValue([{billingProvider,isActive:false,paymentFailed:true,stripeSubscriptionCanceled:false,appleBillingStatus:'payment_failed',endDate:new Date('2026-01-01'),plan:{validityType:'MONTHLY'}}]);
 await expect(sync()).rejects.toThrow(`GOOGLE_PROVIDER_CONFLICT_${billingProvider.toUpperCase()}`);
 expect(db.subscription.create).not.toHaveBeenCalled();expect(ensureCompanyPlanSetup).not.toHaveBeenCalled();expect(gateway.acknowledge).not.toHaveBeenCalled();
 expect(ledger.lastErrorCode).toBe(`GOOGLE_PROVIDER_CONFLICT_${billingProvider.toUpperCase()}`);
});
