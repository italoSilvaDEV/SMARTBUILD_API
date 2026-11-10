import { resolveApplePlanId } from './MobileStorePlanMapping';
import { ensureCompanyPlanSetup } from './MobilePlanSetup';
import { admitVerifiedBilling, billingCoordinationEnabled, lockBillingCompany, BillingAttemptError } from './BillingPurchaseCoordinator';
import { Prisma } from '@prisma/client';
import Jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";

export type AppleBillingStatus =
  | "grace"
  | "paid"
  | "trial"
  | "canceled"
  | "payment_failed"
  | "expired"
  | "refunded"
  | "unknown";

type AppleTransaction = {
  bundleId?: string;
  currency?: string;
  expiresDate?: number;
  originalTransactionId?: string;
  price?: number;
  productId?: string;
  purchaseDate?: number;
  revocationDate?: number;
  offerDiscountType?: string;
  transactionId?: string;
};

type AppleRenewal = { autoRenewStatus?: number; gracePeriodExpiresDate?: number };

type AppleStatusItem = {
  originalTransactionId: string;
  signedRenewalInfo?: string;
  signedTransactionInfo?: string;
  status: number;
};

function decodePayload<T>(jws: string): T {
  const payload = jws.split(".")[1];
  if (!payload) throw new Error("Invalid Apple signed payload.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
}

function createAppStoreToken() {
  const issuerId = process.env.APP_STORE_ISSUER_ID;
  const keyId = process.env.APP_STORE_KEY_ID;
  const privateKey = process.env.APP_STORE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!issuerId || !keyId || !privateKey) {
    throw new Error("Apple App Store Server API credentials are not configured.");
  }

  return Jwt.sign(
    { bid: process.env.APP_STORE_BUNDLE_ID || process.env.APPLE_BUNDLE_ID || "com.struxpro.app" },
    privateKey,
    { algorithm: "ES256", audience: "appstoreconnect-v1", expiresIn: "5m", issuer: issuerId, keyid: keyId },
  );
}

export function classifyAppleBillingStatus(input: {
  status: number;
  autoRenewStatus?: number;
  price?: number;
  offerDiscountType?: string;
  revocationDate?: number;
  expiresDate?: number;
  gracePeriodExpiresDate?: number;
  now?: number;
}): AppleBillingStatus {
  if (input.revocationDate || input.status === 5) return "refunded";
  if (input.status === 4 && Number.isFinite(input.gracePeriodExpiresDate)
    && input.gracePeriodExpiresDate! > (input.now ?? Date.now())) return "grace";
  if (input.status === 3 || input.status === 4) return "payment_failed";
  if (input.status === 2 || (input.expiresDate != null && input.expiresDate <= (input.now ?? Date.now()))) {
    return "expired";
  }
  if (input.status !== 1) return "unknown";
  if (input.autoRenewStatus === 0) return "canceled";
  if (input.autoRenewStatus !== 1) return "unknown";
  if (input.offerDiscountType === "FREE_TRIAL" || input.price === 0) return "trial";
  return typeof input.price === "number" && input.price > 0 ? "paid" : "unknown";
}

async function fetchCurrentAppleStatus(transactionId: string) {
  const token = createAppStoreToken();
  const bases = [
    { environment: "production" as const, url: "https://api.storekit.apple.com" },
    { environment: "sandbox" as const, url: "https://api.storekit-sandbox.apple.com" },
  ];

  for (const base of bases) {
    const response = await fetch(
      `${base.url}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) },
    );
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`Apple subscription status request failed (${response.status}).`);

    const data = (await response.json()) as {
      bundleId?: string;
      data?: Array<{ lastTransactions?: AppleStatusItem[] }>;
    };
    const expectedBundleId = process.env.APP_STORE_BUNDLE_ID || process.env.APPLE_BUNDLE_ID || "com.struxpro.app";
    if (data.bundleId && data.bundleId !== expectedBundleId) {
      throw new Error("Apple subscription belongs to a different app.");
    }
    return { environment: base.environment, items: data.data?.flatMap(group => group.lastTransactions || []) || [] };
  }

  throw new Error("Apple subscription status was not found.");
}

export async function refreshAppleBillingStatus(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.billingProvider !== "apple") return null;

  const result=billingCoordinationEnabled()
    ? await prisma.$transaction(async tx=>{
        await lockBillingCompany(tx,subscription.companyId);
        return refreshVerifiedAppleStatus(subscription,tx);
      },{isolationLevel:'ReadCommitted',timeout:60000})
    : await refreshVerifiedAppleStatus(subscription,prisma);
  if(result===null) throw new BillingAttemptError('BILLING_REQUIRES_REVIEW','apple');
  return result;
}

async function refreshVerifiedAppleStatus(subscription: NonNullable<Awaited<ReturnType<typeof prisma.subscription.findUnique>>>, db:Prisma.TransactionClient) {
  const lookupId = subscription.storeOriginalTransactionId || subscription.storeTransactionId;
  if (!lookupId) throw new Error("Apple subscription has no transaction identifier.");

  const current = await fetchCurrentAppleStatus(lookupId);
  const item = current.items.find(candidate => candidate.originalTransactionId === subscription.storeOriginalTransactionId)
    || current.items.find(candidate => candidate.originalTransactionId === lookupId);
  if (!item?.signedTransactionInfo) throw new Error("Apple did not return the subscription transaction.");

  const transaction = decodePayload<AppleTransaction>(item.signedTransactionInfo);
  const renewal = item.signedRenewalInfo ? decodePayload<AppleRenewal>(item.signedRenewalInfo) : {};
  const expectedBundleId = process.env.APP_STORE_BUNDLE_ID || process.env.APPLE_BUNDLE_ID || "com.struxpro.app";
  if (transaction.bundleId && transaction.bundleId !== expectedBundleId) {
    throw new Error("Apple transaction belongs to a different app.");
  }
  if (transaction.originalTransactionId !== item.originalTransactionId) {
    throw new Error("Apple subscription identifiers do not match.");
  }

  const billingStatus = classifyAppleBillingStatus({
    status: item.status,
    autoRenewStatus: renewal.autoRenewStatus,
    price: transaction.price,
    offerDiscountType: transaction.offerDiscountType,
    revocationDate: transaction.revocationDate,
    expiresDate: transaction.expiresDate,
    gracePeriodExpiresDate: renewal.gracePeriodExpiresDate,
  });
  const expiresAt = Number(billingStatus === 'grace' ? renewal.gracePeriodExpiresDate : transaction.expiresDate);
  const chargedAt = Number(transaction.purchaseDate);
  const charged = typeof transaction.price === "number" && transaction.price > 0
    && transaction.offerDiscountType !== "FREE_TRIAL";

  const update = async (db: Prisma.TransactionClient) => db.subscription.update({
    where: { id: subscription.id },
    data: {
      appleBillingStatus: billingStatus,
      appleLastChargedAt: charged && Number.isFinite(chargedAt) && chargedAt > 0 ? new Date(chargedAt) : null,
      autoRenewing: renewal.autoRenewStatus === 1 ? true : renewal.autoRenewStatus === 0 ? false : subscription.autoRenewing,
      endDate: Number.isFinite(expiresAt) && expiresAt > 0 ? new Date(expiresAt) : subscription.endDate,
      isActive: (item.status === 1 && !transaction.revocationDate || billingStatus === "grace")
        && (Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt > Date.now() : subscription.endDate > new Date()),
      paymentFailed: item.status === 3 || item.status === 4,
      storeEnvironment: current.environment,
      lastVerifiedAt: new Date(),
    },
  });



  if (billingCoordinationEnabled()) {
    const active=(item.status===1 && !transaction.revocationDate || billingStatus==='grace')
      && (Number.isFinite(expiresAt) && expiresAt>0 ? expiresAt>Date.now() : subscription.endDate>new Date());
    if(!await admitVerifiedBilling(db,subscription.companyId,'apple',lookupId,active,[subscription.id],['expired','refunded'].includes(billingStatus))) return null;
    if(active) {
      const products=JSON.parse(process.env.MOBILE_APP_PRODUCTS_JSON || '[]');
      if(!Array.isArray(products)) throw new Error('Invalid Apple plan mappings.');
      const planId=resolveApplePlanId({productId:transaction.productId,configuredProducts:products,
        legacyProductId:process.env.MOBILE_APP_PRODUCT_ID,legacyPlanId:process.env.MOBILE_APP_PLAN_ID});
      const plan=await db.plan.findUniqueOrThrow({where:{id:planId},include:{permissionGroup:{include:{GroupPermissionsList:{select:{permission_id:true}}}}}});
      await db.subscription.update({where:{id:subscription.id},data:{planId,storeProductId:transaction.productId,storeTransactionId:transaction.transactionId}});
      await ensureCompanyPlanSetup(subscription.companyId,plan,db);
    }
  }
  await update(db);
  return billingStatus;
}

export async function reconcileAppleBillingStatuses(limit = 50, afterId?: string) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      billingProvider: "apple",
      storeOriginalTransactionId: { not: null },
      OR: [
        { isActive: true },
        { appleBillingStatus: null },
        { appleBillingStatus: "paid" },
        { appleBillingStatus: "payment_failed" },
        { appleBillingStatus: "grace" },
      ],
      ...(afterId ? { id: { gt: afterId } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: limit,
  });

  let updated = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      await refreshAppleBillingStatus(subscription.id);
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error("[AppleBillingStatus] Could not reconcile subscription", subscription.id, error);
    }
  }
  return { updated, failed, scanned: subscriptions.length, lastId: subscriptions[subscriptions.length - 1]?.id };
}
