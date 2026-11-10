import { admitVerifiedBilling, billingReference } from './BillingPurchaseCoordinator';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { parseAndroidPlanMappings } from './AndroidBillingPolicy';
import { GoogleBillingError, normalizeGooglePurchase, assertGoogleOwnership } from './GooglePlayPurchase';
import { GooglePlayGateway, createGooglePlayGateway } from './GooglePlayGateway';
import { ensureCompanyPlanSetup } from './MobilePlanSetup';
import { assertNoActiveForeignContract, SubscriptionPurchaseConflict } from './SubscriptionPurchaseGuard';
export class GooglePlayBillingService {
    constructor(private readonly db: PrismaClient = prisma, private readonly gateway: GooglePlayGateway = createGooglePlayGateway(), private readonly env: NodeJS.ProcessEnv = process.env) { }
    private enabled() {
        if (this.env.GOOGLE_PLAY_NATIVE_ENABLED !== 'true' || !this.env.GOOGLE_PLAY_PACKAGE_NAME)
            throw new GoogleBillingError('GOOGLE_NATIVE_DISABLED', 503);
    }
    private token(value: unknown): asserts value is string {
        if (typeof value !== 'string' || !value.trim() || value.length > 512)
            throw new GoogleBillingError('GOOGLE_TOKEN_INVALID', 400);
    }
    private async authorizeActor(actorId: string, companyId: string) {
        const actor = await this.db.user.findUnique({ where: { id: actorId }, include: { office: true, companies: { include: { office: true } } } });
        const office = actor?.companies.find(link => link.companyId === companyId)?.office ?? (actor?.company_id === companyId ? actor.office : null);
        if (!actor || actor.isDisabled || !office || !['Owner', 'Administrator'].includes(office.name))
            throw new GoogleBillingError('GOOGLE_COMPANY_AUTHORITY_REQUIRED', 403);
    }
    private async ensureLedger(token: string) {
        try {
            return await this.db.googlePlayPurchaseSync.upsert({ where: { purchaseToken: token }, create: { purchaseToken: token }, update: {} });
        } catch (error) {
            // MySQL emulates upsert: concurrent first deliveries can race on the unique token.
            if ((error as { code?: string }).code !== 'P2002') throw error;
            return this.db.googlePlayPurchaseSync.findUniqueOrThrow({ where: { purchaseToken: token } });
        }
    }
    async sync(input: {
        token: string;
        companyId?: string;
        actorId?: string;
        productId?: string;
    }) {
        this.enabled();
        this.token(input.token);
        if (input.companyId) {
            if (!input.actorId)
                throw new GoogleBillingError('GOOGLE_COMPANY_AUTHORITY_REQUIRED', 403);
            await this.authorizeActor(input.actorId, input.companyId);
        }
        const row = await this.ensureLedger(input.token);
        if (row.companyId && input.companyId && row.companyId !== input.companyId)
            throw new GoogleBillingError('GOOGLE_COMPANY_MISMATCH', 403);
        if (row.retired)
            throw new GoogleBillingError('GOOGLE_TOKEN_REPLACED');
        const leaseId = randomUUID(), now = new Date();
        const claim = await this.db.googlePlayPurchaseSync.updateMany({ where: { id: row.id, retired: false, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { leaseId, lockedUntil: new Date(now.getTime() + 120000), attempts: { increment: 1 } } });
        if (claim.count !== 1)
            throw new GoogleBillingError('GOOGLE_SYNC_BUSY', 503);
        try {
            // Every notification re-reads Google; event timestamps/types never overwrite entitlement.
            const raw = await this.gateway.get(input.token);
            const purchase = normalizeGooglePurchase(raw, parseAndroidPlanMappings(this.env.ANDROID_BILLING_PLAN_MAPPINGS), input.productId);
            const exact = await this.db.subscription.findUnique({ where: { googlePurchaseToken: input.token } });
            const previous = purchase.linkedToken ? await this.db.subscription.findUnique({ where: { googlePurchaseToken: purchase.linkedToken } }) : null;
            const companyId = input.companyId || row.companyId || exact?.companyId || previous?.companyId;
            if (!companyId)
                throw new GoogleBillingError('GOOGLE_OWNER_UNRESOLVED');
            if ([exact, previous].some(s => s && (s.companyId !== companyId || s.billingProvider !== 'google')))
                throw new GoogleBillingError('GOOGLE_COMPANY_MISMATCH', 403);
            assertGoogleOwnership(purchase, companyId, !!exact || !!previous || row.companyId === companyId, (this.env.GOOGLE_PLAY_TEST_COMPANY_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
            if (purchase.environment === 'production' && this.env.GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES !== 'true')
                throw new GoogleBillingError('GOOGLE_LIVE_PURCHASES_DISABLED', 403);
            const result = await this.db.$transaction(async (tx) => {
                // Serialize all Google tokens for the company and fence expired worker leases.
                await tx.$queryRaw `SELECT id FROM Company WHERE id = ${companyId} FOR UPDATE`;
                await tx.$queryRaw `SELECT id FROM GooglePlayPurchaseSync WHERE id = ${row.id} FOR UPDATE`;
                const current = await tx.googlePlayPurchaseSync.findUniqueOrThrow({ where: { id: row.id } });
                if (current.leaseId !== leaseId || current.retired)
                    throw new GoogleBillingError('GOOGLE_LEASE_SUPERSEDED', 503);
                if (current.companyId && current.companyId !== companyId)
                    throw new GoogleBillingError('GOOGLE_COMPANY_MISMATCH', 403);
                const linkedLedger = purchase.linkedToken ? await tx.googlePlayPurchaseSync.findUnique({ where: { purchaseToken: purchase.linkedToken } }) : null;
                if (linkedLedger?.retired && !current.subscriptionId)
                    throw new GoogleBillingError('GOOGLE_REPLACEMENT_CONFLICT');
                const plan = await tx.plan.findUnique({ where: { id: purchase.planId }, include: { permissionGroup: { include: { GroupPermissionsList: { select: { permission_id: true } } } } } });
                if (!plan)
                    throw new GoogleBillingError('GOOGLE_PLAN_NOT_FOUND');
                const existing = await tx.subscription.findUnique({ where: { googlePurchaseToken: input.token } });
                const older = purchase.linkedToken ? await tx.subscription.findUnique({ where: { googlePurchaseToken: purchase.linkedToken } }) : null;
                if ([existing, older].some(s => s && (s.companyId !== companyId || s.billingProvider !== 'google')))
                    throw new GoogleBillingError('GOOGLE_COMPANY_MISMATCH', 403);

                if (!await admitVerifiedBilling(tx,companyId,'google',billingReference(input.token),purchase.active,
                    [existing?.id,older?.id].filter((id):id is string=>!!id),['SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(purchase.state))) {
                    await tx.googlePlayPurchaseSync.update({where:{id:row.id},data:{companyId,state:purchase.state,lastVerifiedAt:new Date(),lastErrorCode:'GOOGLE_BILLING_CONFLICT'}});
                    return {active:false,pending:false,subscriptionId:existing?.id??null,conflict:true};
                }
                // Pending replacement must leave the currently paid token untouched.
                let subscription = existing;
                if (!purchase.pending) {
                    if (purchase.active) {
                        try { await assertNoActiveForeignContract(tx, companyId, 'google'); }
                        catch (error) {
                            if (error instanceof SubscriptionPurchaseConflict)
                                throw new GoogleBillingError(`GOOGLE_PROVIDER_CONFLICT_${error.provider.toUpperCase()}`, 409);
                            throw error;
                        }
                    }
                    const other = await tx.subscription.findFirst({ where: { companyId, isActive: true, id: { notIn: [existing?.id, older?.id].filter((id): id is string => !!id) }, NOT: { plan: { validityType: 'FREE' } } } });
                    if (purchase.active && other)
                        throw new GoogleBillingError('GOOGLE_OTHER_SUBSCRIPTION_ACTIVE');
                    const data = { billingProvider: 'google' as const, companyId, planId: plan.id, startDate: purchase.startDate, endDate: purchase.endDate, isActive: purchase.active,
                        paymentFailed: purchase.state === 'SUBSCRIPTION_STATE_ON_HOLD', stripeSubscriptionCanceled: false,
                        googlePurchaseToken: input.token, storeProductId: purchase.productId, storeTransactionId: purchase.orderId,
                        storeEnvironment: purchase.environment, autoRenewing: purchase.autoRenewing, lastVerifiedAt: new Date() };
                    subscription = existing ? await tx.subscription.update({ where: { id: existing.id }, data }) : await tx.subscription.create({ data });
                    if (purchase.active) {
                        if (older && older.id !== subscription.id)
                            await tx.subscription.update({ where: { id: older.id }, data: { isActive: false } });
                        if (purchase.linkedToken)
                            await tx.googlePlayPurchaseSync.upsert({ where: { purchaseToken: purchase.linkedToken }, create: { purchaseToken: purchase.linkedToken, companyId, subscriptionId: older?.id, retired: true }, update: { retired: true, leaseId: null, lockedUntil: null } });
                        await ensureCompanyPlanSetup(companyId, plan, tx);
                    }
                    else if (!other && !older?.isActive) {
                        await tx.company.update({ where: { id: companyId }, data: { mobileSubscriptionStatus: 'expired' } });
                    }
                }
                await tx.googlePlayPurchaseSync.update({ where: { id: row.id }, data: { companyId, subscriptionId: subscription?.id, state: purchase.trial ? 'TRIAL' : purchase.state, lastVerifiedAt: new Date(), lastErrorCode: null } });
                return { active: purchase.active, pending: purchase.pending, subscriptionId: subscription?.id ?? null };
            }, { isolationLevel: 'ReadCommitted', timeout: 20000 });
            if ('conflict' in result && result.conflict) throw new GoogleBillingError('GOOGLE_BILLING_CONFLICT',409);
            // Persist entitlement BEFORE acknowledgement. Failed ack is retried from the durable ledger.
            if (purchase.needsAcknowledgement)
                await this.gateway.acknowledge(input.token, purchase.productId);
            await this.db.googlePlayPurchaseSync.updateMany({ where: { id: row.id, leaseId }, data: { leaseId: null, lockedUntil: null, lastErrorCode: null,
                    acknowledgedAt: (purchase.needsAcknowledgement || raw.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') ? new Date() : undefined, nextAttemptAt: new Date(Date.now() + (purchase.pending ? 60000 : 15 * 60000)) } });
            return result;
        }
        catch (error) {
            const code = error instanceof GoogleBillingError ? error.code : 'GOOGLE_SYNC_FAILED';
            await this.db.googlePlayPurchaseSync.updateMany({ where: { id: row.id, leaseId }, data: { leaseId: null, lockedUntil: null, lastErrorCode: code, nextAttemptAt: new Date(Date.now() + 60000) } });
            // Never propagate SDK errors: they may contain authorization headers or purchase tokens.
            throw error instanceof GoogleBillingError ? error : new GoogleBillingError(code, 503);
        }
    }
    async receivePush(authorization: string | undefined, body: any) {
        this.enabled();
        const audience = this.env.GOOGLE_PLAY_PUBSUB_AUDIENCE, email = this.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT;
        if (!audience || !email)
            throw new GoogleBillingError('GOOGLE_PUSH_CONFIG_MISSING', 503);
        if (!authorization?.startsWith('Bearer '))
            throw new GoogleBillingError('GOOGLE_PUSH_UNAUTHORIZED', 401);
        let identity;
        try {
            identity = await this.gateway.verifyPush(authorization.slice(7), audience);
        }
        catch {
            throw new GoogleBillingError('GOOGLE_PUSH_UNAUTHORIZED', 401);
        }
        if (!identity || identity.email_verified !== true || identity.email !== email || !['https://accounts.google.com', 'accounts.google.com'].includes(identity.iss || ''))
            throw new GoogleBillingError('GOOGLE_PUSH_UNAUTHORIZED', 401);
        let payload: any;
        try {
            if (typeof body?.message?.data !== 'string' || body.message.data.length > 65536)
                throw new Error();
            payload = JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8'));
        }
        catch {
            throw new GoogleBillingError('GOOGLE_PUSH_INVALID', 400);
        }
        if (payload?.packageName !== this.env.GOOGLE_PLAY_PACKAGE_NAME)
            throw new GoogleBillingError('GOOGLE_PACKAGE_MISMATCH', 400);
        if (payload.testNotification)
            return { received: true, test: true };
        const token = payload.subscriptionNotification?.purchaseToken || payload.voidedPurchaseNotification?.purchaseToken;
        if (!token)
            return { received: true, ignored: true };
        this.token(token);
        // Enqueue before responding. Payload/order is not trusted as subscription state.
        await this.db.googlePlayPurchaseSync.upsert({ where: { purchaseToken: token }, create: { purchaseToken: token }, update: { nextAttemptAt: new Date() } });
        return { received: true, queued: true };
    }
    async reconcile(limit = 50) {
        this.enabled();
        const rows = await this.db.googlePlayPurchaseSync.findMany({ where: { retired: false, nextAttemptAt: { lte: new Date() }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] }, orderBy: { nextAttemptAt: 'asc' }, take: Math.min(Math.max(limit, 1), 100) });
        let updated = 0, failed = 0;
        for (const row of rows)
            try {
                await this.sync({ token: row.purchaseToken });
                updated++;
            }
            catch {
                failed++;
            }
        return { scanned: rows.length, updated, failed };
    }
    async seedExisting(cursor?: string) {
        this.enabled();
        const rows = await this.db.subscription.findMany({ where: { billingProvider: 'google', googlePurchaseToken: { not: null } }, orderBy: { id: 'asc' }, take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
        for (const row of rows)
            await this.db.googlePlayPurchaseSync.upsert({ where: { purchaseToken: row.googlePurchaseToken! }, create: { purchaseToken: row.googlePurchaseToken!, companyId: row.companyId, subscriptionId: row.id }, update: {} });
        return { scanned: rows.length, lastId: rows[rows.length - 1]?.id };
    }
}
export const googlePlayBilling = new GooglePlayBillingService();
