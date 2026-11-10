import { billingCoordinationEnabled, billingPurchaseCoordinator, BillingAttemptError, billingReference } from '../../services/BillingPurchaseCoordinator';
import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { androidBillingAccess, AndroidBillingError } from '../../services/AndroidBillingAccess';
import { parseAndroidPlanMappings } from '../../services/AndroidBillingPolicy';
import { buildAuthResponse } from './MobileAuthController';
import { assertNoForeignSubscription, assertNoPendingGooglePurchase, SubscriptionPurchaseConflict } from '../../services/SubscriptionPurchaseGuard';

// A separate, read-only contract: never calls Stripe or changes subscription state.
export class GooglePlayCatalogController {
  private async snapshot(req: Request, includeAttempts=true) {
    const access = await androidBillingAccess(req);
    const auth = await buildAuthResponse(access.userId, access.companyId, true);
    if (!('isExpired' in auth) || auth.user.company?.id !== access.companyId) {
      throw new AndroidBillingError(409, 'Subscription requires verification.');
    }
    const active = !auth.isExpired && !auth.paymentFailed && !auth.stripeSubscriptionCanceled;
    const expiredInvitation = auth.user.plan?.validityType === 'FREE' && auth.isExpired;
    let canPurchase = !active && (!auth.subscription?.isActive || expiredInvitation === true);
    let purchaseBlock: { provider: string; code: string; message: string } | undefined;
    if (canPurchase) {
      try {
        await assertNoForeignSubscription(prisma, access.companyId, 'google');
        await assertNoPendingGooglePurchase(prisma, access.companyId);
      }
      catch (error) {
        if (!(error instanceof SubscriptionPurchaseConflict)) throw error;
        canPurchase = false;
        purchaseBlock = { provider: error.provider, code: error.code, message: error.message };
      }
    }
    if(canPurchase && includeAttempts && billingCoordinationEnabled()) {
      const block=await billingPurchaseCoordinator.purchaseBlock(access.companyId);
      if(block) { canPurchase=false; purchaseBlock={provider:block.provider,code:block.code,message:block.message}; }
    }
    return { access, auth, active, canPurchase, purchaseBlock };
  }

  async status(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { auth, active, canPurchase, purchaseBlock } = await this.snapshot(req);
      return res.json({ state: active ? 'active' : 'pending', canPurchase,
        ...(purchaseBlock ? { purchaseBlock } : {}),
        ...(!req.body.pendingToken || active ? { auth } : {}) });
    } catch (error) { return this.failure(res, error); }
  }

  async configuration(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { access, canPurchase, purchaseBlock } = await this.snapshot(req);
      const country=req.body.country;
      const {available,packageName}=await this.catalog(access.companyId,country);
      // No server prices: the device must display the eligible store offer's actual phases.
      return res.json({ country, program: 'google-play', packageName, canPurchase, mappings: available, coordinationEnabled: billingCoordinationEnabled(),
        ...(purchaseBlock ? { purchaseBlock } : {}) });
    } catch (error) { return this.failure(res, error); }
  }


  private async catalog(companyId:string, country:string) {

      if (!['BR', 'US', 'ES'].includes(country)) throw new AndroidBillingError(400, 'Unsupported Google Play country.');
      const env = process.env;
      const testCompanies = (env.GOOGLE_PLAY_TEST_COMPANY_IDS || '').split(',').map(id => id.trim());
      if (env.GOOGLE_PLAY_NATIVE_ENABLED !== 'true' || !env.GOOGLE_PLAY_PACKAGE_NAME
        || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || !env.GOOGLE_PLAY_PUBSUB_AUDIENCE
        || !env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT
        || (env.GOOGLE_PLAY_ACCEPT_LIVE_PURCHASES !== 'true' && !testCompanies.includes(companyId))) {
        throw new AndroidBillingError(503, 'Google Play billing is not available yet.');
      }
      const mappings = parseAndroidPlanMappings(env.ANDROID_BILLING_PLAN_MAPPINGS)
        .filter(m => ['smartbuild_starter_monthly', 'smartbuild_essentials_monthly'].includes(m.productId) && m.basePlanId === 'monthly');
      const plans = await prisma.plan.findMany({
        where: { id: { in: mappings.map(m => m.planId) }, isActive: true, isCampaign: false, isInviteOnly: false, validityType: 'MONTHLY', validityDuration: 1 },
        select: { id: true, name: true, features: true, description: true },
      });
      const available = mappings.flatMap(mapping => {
        const plan = plans.find(p => p.id === mapping.planId);
        return plan ? [{ ...mapping, name: plan.name, features: plan.features, description: plan.description, trialOfferId: 'trial-7-days' }] : [];
      });
      if (!available.length) throw new AndroidBillingError(503, 'Google Play catalog is unavailable.');

    return {available,packageName:env.GOOGLE_PLAY_PACKAGE_NAME};
  }

  async begin(req:Request,res:Response) {
    res.setHeader('Cache-Control','no-store');
    try {
      if(!billingCoordinationEnabled()) throw new AndroidBillingError(503,'Billing coordination is not enabled.');
      const {access,canPurchase,purchaseBlock}=await this.snapshot(req,false);
      if(!canPurchase) throw new BillingAttemptError(purchaseBlock?.code || 'SUBSCRIPTION_ALREADY_EXISTS',purchaseBlock?.provider || 'google');
      const {available}=await this.catalog(access.companyId,req.body.country);
      const mapping=available.find(m=>m.productId===req.body.productId && m.basePlanId===req.body.basePlanId);
      if(!mapping || typeof req.body.requestId!=='string' || !/^[a-zA-Z0-9-]{16,64}$/.test(req.body.requestId))
        throw new AndroidBillingError(400,'Invalid purchase request.');
      const attempt=await billingPurchaseCoordinator.reserve(access.companyId,'google',mapping.planId,billingReference(req.body.requestId));
      await billingPurchaseCoordinator.launch(access.companyId,attempt.id);
      return res.json({attemptId:attempt.id});
    } catch(error) {return this.failure(res,error);}
  }

  async cancelAttempt(req:Request,res:Response) {
    try {
      if(!billingCoordinationEnabled()) throw new AndroidBillingError(503,'Billing coordination is not enabled.');
      const access=await androidBillingAccess(req);
      if(typeof req.body.attemptId!=='string') throw new AndroidBillingError(400,'Invalid attempt.');
      await billingPurchaseCoordinator.finishNative(access.companyId,req.body.attemptId);
      return res.json({released:true});
    } catch(error) {return this.failure(res,error);}
  }

  private failure(res: Response, error: unknown) {
    if(error instanceof BillingAttemptError || error instanceof SubscriptionPurchaseConflict)
      return res.status(error.status).json({error:error.message,code:error.code,provider:error.provider});
    return res.status(error instanceof AndroidBillingError ? error.status : 503)
      .json({ error: error instanceof AndroidBillingError ? error.message : 'Google Play billing requires verification.' });
  }
}
