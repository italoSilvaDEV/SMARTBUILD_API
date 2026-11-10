import { Request, Response } from 'express';
import type Stripe from 'stripe';
import { getAndroidBillingProgram, isAndroidBillingEnabled, parseAndroidPlanMappings } from '../../services/AndroidBillingPolicy';
import { prisma } from '../../utils/prisma';
import { stripeConfig } from '../../config/stripe';
import { AndroidBillingError, androidBillingAccess } from '../../services/AndroidBillingAccess';
import { buildAuthResponse } from './MobileAuthController';
import { getAndroidReplacementContext } from '../../services/AndroidBillingReporting';

function failure(res: Response, error: unknown) {
  if (error instanceof AndroidBillingError) return res.status(error.status).json({ error: error.message });
  console.error('[AndroidBilling] Request failed', error instanceof Error ? error.name : 'Unknown error');
  return res.status(503).json({ error: 'Billing is temporarily unavailable. Please try again.' });
}

function returnUrl() {
  const url = new URL('/android-billing/return', process.env.URL_API);
  if (url.protocol !== 'https:') throw new Error('Android billing requires an HTTPS API URL.');
  return url.toString();
}

export class AndroidBillingController {
  async replacementContext(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { companyId } = await androidBillingAccess(req);
      const context = await getAndroidReplacementContext(companyId);
      if (!context) throw new AndroidBillingError(409, 'The current subscription is not ready for an in-app plan change.');
      return res.json(context);
    } catch (error) { return failure(res, error); }
  }
  async status(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const access = await androidBillingAccess(req);
      // Entitlements are applied by the SAME signed Stripe webhook used by the web app.
      const subscription = await prisma.subscription.findFirst({
        where: { companyId: access.companyId, isActive: true, paymentFailed: false, endDate: { gt: new Date() } },
        orderBy: { startDate: 'desc' },
      });
      if (!subscription) return res.json({ state: 'pending', ...(!req.body.pendingToken ? { auth: await buildAuthResponse(access.userId, access.companyId, true) } : {}) });
      if (subscription.billingProvider === 'stripe' && access.company.mobileSubscriptionStatus === 'pending_subscription') {
        await prisma.company.update({ where: { id: access.companyId }, data: { mobileSubscriptionStatus: 'active' } });
      }
      return res.json({ state: 'active', auth: await buildAuthResponse(access.userId, access.companyId) });
    } catch (error) { return failure(res, error); }
  }

  returnToApp(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // No credentials, entitlement claims or user-provided redirect URLs.
    return res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartBuild</title><p>Return to SmartBuild to check your subscription.</p><a href="smartbuildadmin://billing-return">Return to SmartBuild</a>');
  }

  async checkout(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const access = await androidBillingAccess(req);
      const { country, externalTransactionToken, requestId, planId, action } = req.body;
      if (!isAndroidBillingEnabled(country) || process.env.ANDROID_BILLING_REPORTING_ENABLED !== 'true') throw new AndroidBillingError(503, 'Android billing is not available yet.');
      if (!['subscribe', 'manage'].includes(action) || typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
        throw new AndroidBillingError(400, 'Invalid billing request.');
      }
      if (typeof externalTransactionToken !== 'string' || (!(action === 'manage' && country === 'BR') && !externalTransactionToken.trim()) || externalTransactionToken.length > 16384) {
        throw new AndroidBillingError(400, 'A fresh Google Play billing authorization is required.');
      }
      const stripe = stripeConfig.getClient();
      // Commit the idempotency record BEFORE contacting Stripe. If Stripe succeeds but the
      // following DB transaction fails, a retry still uses the same Stripe idempotency key.
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM Company WHERE id = ${access.companyId} FOR UPDATE`;
        const previous = await tx.androidBillingAttempt.findUnique({ where: { id: requestId } });
        if (previous) {
          if (['rejected', 'expired', 'completed'].includes(previous.status)) throw new AndroidBillingError(409, 'This billing request has ended. Refresh your subscription before trying again.');
          return;
        }
        const unresolved = await tx.androidBillingAttempt.findFirst({ where: { companyId: access.companyId, status: 'pending', checkoutId: null, subscriptionId: null } });
        if (unresolved) throw new AndroidBillingError(409, 'Retry the unfinished billing request before starting another payment.');
        const existing = await tx.subscription.findFirst({ where: { companyId: access.companyId }, orderBy: { startDate: 'desc' } });
        const chosen = await tx.plan.findFirst({ where: { id: action === 'subscribe' ? String(planId) : existing?.planId || '', ...(action === 'subscribe' ? { isActive: true, isCampaign: false, isInviteOnly: false } : {}) } });
        if (!chosen?.stripePriceId) throw new AndroidBillingError(400, 'Select an available paid plan.');
        await tx.androidBillingAttempt.create({ data: {
          id: requestId, companyId: access.companyId, userId: access.userId, planId: chosen.id, country,
          externalTransactionToken, subscriptionId: existing?.stripeSubscriptionId,
          status: action === 'manage' ? 'management' : 'pending',
        } });
      });
      const result = await prisma.$transaction(async tx => {
        // Serialize company checkout creation, including different devices/administrators.
        await tx.$queryRaw`SELECT id FROM Company WHERE id = ${access.companyId} FOR UPDATE`;
        let existing = await tx.subscription.findFirst({
          where: { companyId: access.companyId, OR: [{ isActive: true, endDate: { gt: new Date() } }, { billingProvider: 'stripe', paymentFailed: true }] },
          orderBy: { startDate: 'desc' },
        });
        if (existing && ['apple', 'google'].includes(existing.billingProvider)) {
          throw new AndroidBillingError(409, 'Manage your existing store subscription before starting another subscription.');
        }
        let live: Stripe.Subscription | null = existing?.stripeSubscriptionId ? await stripe.subscriptions.retrieve(existing.stripeSubscriptionId) : null;
        if ((!live || ['canceled', 'incomplete_expired'].includes(live.status)) && access.company.stripeCustomerId) {
          for await (const candidate of stripe.subscriptions.list({ customer: access.company.stripeCustomerId, status: 'all', limit: 100 })) {
            if (!['canceled', 'incomplete_expired'].includes(candidate.status)) {
              const local = await tx.subscription.findFirst({ where: { companyId: access.companyId, stripeSubscriptionId: candidate.id } });
              if (!local) throw new AndroidBillingError(409, 'Your existing Stripe subscription is still synchronizing. Check its status before purchasing.');
              live = candidate;
              existing = local;
              break;
            }
          }
        }
        const hasStripe = live && !['canceled', 'incomplete_expired'].includes(live.status);
        const plan = action === 'subscribe' ? await tx.plan.findFirst({ where: { id: String(planId), isActive: true, isCampaign: false, isInviteOnly: false } }) : null;
        if (action === 'subscribe' && (!plan?.stripePriceId || plan.validityType === 'FREE')) throw new AndroidBillingError(400, 'Select an available paid plan.');
        if (country === 'BR' && plan && !parseAndroidPlanMappings(process.env.ANDROID_BILLING_PLAN_MAPPINGS).some(m => m.planId === plan.id)) {
          throw new AndroidBillingError(503, 'This plan is not configured for Google Play.');
        }
        if (action === 'manage' && !hasStripe) throw new AndroidBillingError(409, 'No Stripe subscription is available to manage.');
        let attempt = await tx.androidBillingAttempt.findUnique({ where: { id: requestId } });
        if (attempt && (attempt.companyId !== access.companyId || attempt.userId !== access.userId || attempt.planId !== (plan?.id || existing?.planId) || attempt.country !== country)) {
          throw new AndroidBillingError(409, 'This billing request belongs to another operation.');
        }
        if (attempt && !attempt.checkoutId && !hasStripe) {
          // Expire an abandoned checkout before allowing a fresh one. Stripe rejects expiring a completed session.
          const open = await tx.androidBillingAttempt.findMany({ where: { companyId: access.companyId, id: { not: requestId }, status: 'pending', checkoutId: { not: null } } });
          for (const previous of open) {
            const session = await stripe.checkout.sessions.retrieve(previous.checkoutId!);
            if (session.status === 'complete') throw new AndroidBillingError(409, 'Your payment is being confirmed. Refresh your subscription.');
            if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
            await tx.androidBillingAttempt.update({ where: { id: previous.id }, data: { status: 'expired' } });
          }
        }
        if (!attempt) throw new Error('Billing request not reserved');
        if (hasStripe && live) {
          if (attempt.subscriptionId !== live.id) await tx.androidBillingAttempt.update({ where: { id: attempt.id }, data: { subscriptionId: live.id } });
          const customer = typeof live.customer === 'string' ? live.customer : live.customer.id;
          const item = plan ? live.items.data.find(i => i.price.id === plan.stripePriceId) : null;
          const changing = !!plan && !item;
          if (!changing) await tx.androidBillingAttempt.update({ where: { id: attempt.id }, data: { status: 'management' } });
          const oldPlan = changing ? await tx.plan.findUnique({ where: { id: existing!.planId } }) : null;
          const oldItem = oldPlan ? live.items.data.find(i => i.price.id === oldPlan.stripePriceId) : null;
          if (changing && !oldItem) throw new AndroidBillingError(409, 'The current plan could not be identified.');
          const targetPrice = changing ? await stripe.prices.retrieve(plan!.stripePriceId!) : null;
          // Explicit configuration prevents portal links from opening untracked plan purchases.
          const configuration = await stripe.billingPortal.configurations.create({
            business_profile: { headline: 'SmartBuild subscription' },
            features: {
              customer_update: { enabled: true, allowed_updates: ['address', 'name', 'tax_id'] },
              invoice_history: { enabled: true }, payment_method_update: { enabled: true },
              subscription_cancel: { enabled: true, mode: 'at_period_end' },
              subscription_update: changing ? {
                enabled: true, default_allowed_updates: ['price'], proration_behavior: 'always_invoice',
                products: [{ product: typeof targetPrice!.product === 'string' ? targetPrice!.product : targetPrice!.product.id, prices: [plan!.stripePriceId!] }],
              } : { enabled: false },
            },
          }, { idempotencyKey: `android-portal-config-${attempt.id}` });
          const portal = await stripe.billingPortal.sessions.create({ customer, configuration: configuration.id, return_url: returnUrl(),
            ...(changing ? { flow_data: { type: 'subscription_update_confirm' as const, subscription_update_confirm: { subscription: live.id, items: [{ id: oldItem!.id, price: plan!.stripePriceId!, quantity: oldItem!.quantity || 1 }] }, after_completion: { type: 'redirect' as const, redirect: { return_url: returnUrl() } } } } : {}),
          }, { idempotencyKey: `android-portal-${attempt.id}` });
          return { checkoutUrl: portal.url };
        }
        const metadata = { companyId: access.companyId, planId: plan!.id, androidBillingAttemptId: attempt.id };
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription', line_items: [{ price: plan!.stripePriceId!, quantity: 1 }],
          ...(access.company.stripeCustomerId ? { customer: access.company.stripeCustomerId } : {}),
          client_reference_id: access.companyId, metadata, subscription_data: { metadata },
          success_url: returnUrl(), cancel_url: returnUrl(),
          expires_at: Math.floor(attempt.createdAt.getTime() / 1000) + 1800,
          billing_address_collection: 'required',
        }, { idempotencyKey: `android-checkout-${attempt.id}` });
        await tx.androidBillingAttempt.update({ where: { id: attempt.id }, data: { checkoutId: session.id } });
        return { checkoutUrl: session.url };
      }, { timeout: 60000, maxWait: 10000 }).catch(async error => {
        if (error instanceof AndroidBillingError) {
          await prisma.androidBillingAttempt.updateMany({ where: { id: requestId, userId: access.userId, companyId: access.companyId, checkoutId: null, status: 'pending' }, data: { status: 'rejected' } });
        }
        throw error;
      });
      return res.json(result);
    } catch (error) { return failure(res, error); }
  }

  async configuration(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const country = req.query.country;
    if (country !== 'US' && country !== 'BR') {
      return res.status(400).json({ error: 'Unsupported Google Play country.' });
    }
      if (!isAndroidBillingEnabled(country) || process.env.ANDROID_BILLING_REPORTING_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Android billing is not available yet.' });
    }
    try {
      if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_PLAY_PACKAGE_NAME || process.env.ALLOW_MOBILE_STORE_TEST_PURCHASES === 'true') {
        throw new Error('Verified Google Play billing credentials are required.');
      }
      if (country === 'BR' && (!process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE || !process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT)) throw new Error('Google Play notifications must be configured.');
      const mappings = parseAndroidPlanMappings(process.env.ANDROID_BILLING_PLAN_MAPPINGS);
      const plans = await prisma.plan.findMany({
        where: { isActive: true, isCampaign: false, isInviteOnly: false },
        select: { id: true, stripePriceId: true, validityType: true },
      });
      const paidPlans = plans.filter(plan => plan.validityType !== 'FREE');
      if (paidPlans.some(plan => !plan.stripePriceId)) {
        throw new Error('Every public paid plan requires a Stripe price.');
      }
      if (country === 'BR' && paidPlans.some(plan => !mappings.some(mapping => mapping.planId === plan.id))) {
        throw new Error('Every public paid plan requires a Google Play mapping for Brazil.');
      }
      return res.json({
        country,
        program: getAndroidBillingProgram(country),
        // Prices and features always come from the existing /plans?grouped=true catalog.
        mappings: mappings.filter(mapping => paidPlans.some(plan => plan.id === mapping.planId)),
      });
    } catch (error) {
      console.error('[AndroidBilling] Invalid catalog configuration', error instanceof Error ? error.message : 'Unknown error');
      return res.status(503).json({ error: 'Android billing configuration is incomplete.' });
    }
  }
}
