import { Request, Response } from "express";
import bcrypt from "bcrypt";
import Jwt from "jsonwebtoken";
import { createHash, createPublicKey, randomBytes, randomUUID } from "crypto";
import { google } from "googleapis";

import { prisma } from "../../utils/prisma";
import { OWNER_FULL_ACCESS_DATA, grantOwnerFullAccessForCompany } from "../../utils/ownerFullAccess";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { resolveEffectivePermissions } from "../../utils/planPermissions";

type MobileProvider = "google" | "apple";
type StorePlatform = "ios" | "android";

type VerifiedSocialProfile = {
  provider: MobileProvider;
  providerUserId: string;
  email?: string | null;
  emailVerified: boolean;
  name?: string | null;
  rawProfile?: Record<string, unknown>;
};

type VerifiedStorePurchase = {
  active: boolean;
  productId: string;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  googlePurchaseToken?: string | null;
  startDate: Date;
  endDate: Date;
  autoRenewing?: boolean | null;
  environment: "sandbox" | "production";
};

type MobileProductConfig = {
  planId?: string | null;
  price?: number | null;
  productId: string;
  title?: string | null;
};

const DEFAULT_MOBILE_PRODUCT_IDS = ["smartbuild_pro_monthly_29", "smartbuild_pro_monthly_99"];
const LEGACY_MOBILE_PRODUCT_ID = process.env.MOBILE_APP_PRODUCT_ID || "smartbuild_pro_monthly";
const PENDING_SIGNUP_TOKEN_TTL = "2h";

function parseMobileProductsJson() {
  const rawConfig = process.env.MOBILE_APP_PRODUCTS_JSON;
  if (!rawConfig) return [];

  const parsed = JSON.parse(rawConfig);

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (typeof item === "string") return { productId: item };
        if (item && typeof item === "object" && typeof item.productId === "string") {
          return {
            planId: typeof item.planId === "string" ? item.planId : null,
            price: Number.isFinite(Number(item.price)) ? Number(item.price) : null,
            productId: item.productId,
            title: typeof item.title === "string" ? item.title : null,
          };
        }
        return null;
      })
      .filter(Boolean) as MobileProductConfig[];
  }

  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([productId, value]) => {
      if (typeof value === "string") return { productId, planId: value };
      if (value && typeof value === "object") {
        const config = value as Record<string, unknown>;
        return {
          planId: typeof config.planId === "string" ? config.planId : null,
          price: Number.isFinite(Number(config.price)) ? Number(config.price) : null,
          productId,
          title: typeof config.title === "string" ? config.title : null,
        };
      }
      return { productId };
    });
  }

  return [];
}

function getMobileProductConfigs() {
  const byProductId = new Map<string, MobileProductConfig>();
  const addConfig = (config: MobileProductConfig | null | undefined) => {
    if (!config?.productId?.trim()) return;
    byProductId.set(config.productId.trim(), {
      ...byProductId.get(config.productId.trim()),
      ...config,
      productId: config.productId.trim(),
    });
  };

  parseMobileProductsJson().forEach(addConfig);

  process.env.MOBILE_APP_PRODUCT_IDS?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((productId) => addConfig({ productId }));

  DEFAULT_MOBILE_PRODUCT_IDS.forEach((productId) => addConfig({ productId }));
  if (process.env.MOBILE_APP_PRODUCT_ID) addConfig({ productId: LEGACY_MOBILE_PRODUCT_ID });

  return Array.from(byProductId.values());
}

function getMobileProductIds() {
  return getMobileProductConfigs().map((config) => config.productId);
}

function getPrimaryMobileProductId() {
  return getMobileProductIds()[0] || LEGACY_MOBILE_PRODUCT_ID;
}

function getMobileProductConfig(productId: string) {
  return getMobileProductConfigs().find((config) => config.productId === productId) || null;
}

function assertAllowedMobileProduct(productId: string) {
  if (!getMobileProductIds().includes(productId)) {
    throw new Error("Store purchase product does not match an available mobile plan.");
  }
}

function inferMobilePlanPrice(productId: string) {
  const configuredPrice = getMobileProductConfig(productId)?.price;
  if (configuredPrice) return configuredPrice;
  if (/(^|[^0-9])99([^0-9]|$)/.test(productId)) return 99;
  if (/(^|[^0-9])29([^0-9]|$)/.test(productId)) return 29;
  return null;
}

function normalizeEmail(email?: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function signJwt(payload: Record<string, unknown>, expiresIn = "30d") {
  return Jwt.sign(payload, String(process.env.SECRET_JWT), { expiresIn });
}

function issuePendingToken(userId: string, companyId: string) {
  return signJwt({ type: "mobile_signup", userId, companyId }, PENDING_SIGNUP_TOKEN_TTL);
}

function verifyPendingToken(token?: string | null) {
  if (!token) throw new Error("Missing pending signup token.");
  const decoded = Jwt.verify(token, String(process.env.SECRET_JWT)) as {
    type?: string;
    userId?: string;
    companyId?: string;
  };
  if (decoded.type !== "mobile_signup" || !decoded.userId || !decoded.companyId) {
    throw new Error("Invalid pending signup token.");
  }
  return { userId: decoded.userId, companyId: decoded.companyId };
}

function getBearerToken(req: Request) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}

function getAuthenticatedUserId(req: Request) {
  const headerUserId = (req as any).userId;
  if (headerUserId) return headerUserId as string;

  const token = getBearerToken(req);
  if (!token) return null;

  try {
    const decoded = Jwt.verify(token, String(process.env.SECRET_JWT)) as any;
    return decoded?.userId || decoded?.id || decoded?.sub || null;
  } catch {
    return null;
  }
}

function decodeJwtPayload<T = any>(token: string): T {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Invalid JWT payload.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
}

async function getApplePublicKey(kid: string) {
  const response = await fetch("https://appleid.apple.com/auth/keys");
  if (!response.ok) throw new Error("Could not fetch Apple public keys.");
  const data = (await response.json()) as { keys?: any[] };
  const jwk = data.keys?.find((key) => key.kid === kid);
  if (!jwk) throw new Error("Apple public key not found.");
  return createPublicKey({ key: jwk, format: "jwk" });
}

async function verifyGoogleProfile(idToken: string): Promise<VerifiedSocialProfile> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new Error("Invalid Google sign-in token.");

  const profile = (await response.json()) as any;
  const allowedAudiences = [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean);

  if (allowedAudiences.length > 0 && !allowedAudiences.includes(profile.aud)) {
    throw new Error("Google token audience is not allowed.");
  }

  if (!profile.sub) throw new Error("Google token is missing subject.");

  return {
    provider: "google",
    providerUserId: profile.sub,
    email: normalizeEmail(profile.email),
    emailVerified: profile.email_verified === "true" || profile.email_verified === true,
    name: profile.name || null,
    rawProfile: profile,
  };
}

async function verifyAppleProfile(identityToken: string, fallbackName?: string | null): Promise<VerifiedSocialProfile> {
  const header = JSON.parse(Buffer.from(identityToken.split(".")[0], "base64url").toString("utf8")) as { kid?: string };
  if (!header.kid) throw new Error("Apple token is missing key id.");

  const publicKey = await getApplePublicKey(header.kid);
  const bundleId = process.env.APPLE_BUNDLE_ID || process.env.IOS_BUNDLE_ID || "com.struxpro.app";
  const profile = Jwt.verify(identityToken, publicKey, {
    algorithms: ["RS256"],
    audience: bundleId,
    issuer: "https://appleid.apple.com",
  }) as any;

  if (!profile.sub) throw new Error("Apple token is missing subject.");

  return {
    provider: "apple",
    providerUserId: profile.sub,
    email: normalizeEmail(profile.email),
    emailVerified: profile.email_verified === "true" || profile.email_verified === true,
    name: fallbackName || null,
    rawProfile: profile,
  };
}

async function verifySocialProfile(provider: MobileProvider, token: string, name?: string | null) {
  if (provider === "google") return verifyGoogleProfile(token);
  return verifyAppleProfile(token, name);
}

async function createAppStoreApiToken() {
  const issuerId = process.env.APP_STORE_ISSUER_ID;
  const keyId = process.env.APP_STORE_KEY_ID;
  const rawPrivateKey = process.env.APP_STORE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!issuerId || !keyId || !rawPrivateKey) {
    throw new Error("Apple App Store Server API credentials are not configured.");
  }

  return Jwt.sign(
    {
      bid: process.env.APP_STORE_BUNDLE_ID || process.env.APPLE_BUNDLE_ID || "com.struxpro.app",
    },
    rawPrivateKey,
    {
      algorithm: "ES256",
      audience: "appstoreconnect-v1",
      expiresIn: "5m",
      issuer: issuerId,
      keyid: keyId,
    },
  );
}

async function fetchAppleTransaction(transactionId: string) {
  const token = await createAppStoreApiToken();
  const bases = [
    { environment: "production" as const, url: "https://api.storekit.itunes.apple.com" },
    { environment: "sandbox" as const, url: "https://api.storekit-sandbox.itunes.apple.com" },
  ];

  for (const base of bases) {
    const response = await fetch(`${base.url}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const data = (await response.json()) as { signedTransactionInfo?: string };
      if (!data.signedTransactionInfo) throw new Error("Apple transaction response is missing signed transaction info.");
      return { environment: base.environment, payload: decodeJwtPayload<any>(data.signedTransactionInfo) };
    }
  }

  throw new Error("Apple transaction could not be verified.");
}

async function verifyApplePurchase(input: {
  productId?: string;
  transactionId?: string;
  signedTransactionInfo?: string;
}): Promise<VerifiedStorePurchase> {
  if (process.env.ALLOW_MOBILE_STORE_TEST_PURCHASES === "true" && input.transactionId?.startsWith("test_")) {
    const productId = input.productId || getPrimaryMobileProductId();
    assertAllowedMobileProduct(productId);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    return {
      active: true,
      productId,
      transactionId: input.transactionId,
      originalTransactionId: input.transactionId,
      startDate: now,
      endDate,
      autoRenewing: true,
      environment: "sandbox",
    };
  }

  const resolved = input.signedTransactionInfo
    ? { environment: "production" as const, payload: decodeJwtPayload<any>(input.signedTransactionInfo) }
    : await fetchAppleTransaction(String(input.transactionId || ""));

  const payload = resolved.payload;
  const productId = String(payload.productId || "");
  assertAllowedMobileProduct(productId);

  const startDate = new Date(Number(payload.purchaseDate || Date.now()));
  const endDate = new Date(Number(payload.expiresDate || 0));
  return {
    active: endDate > new Date(),
    productId,
    transactionId: String(payload.transactionId || input.transactionId || ""),
    originalTransactionId: String(payload.originalTransactionId || payload.transactionId || input.transactionId || ""),
    startDate,
    endDate,
    autoRenewing: true,
    environment: resolved.environment,
  };
}

async function verifyGooglePurchase(input: {
  productId?: string;
  purchaseToken?: string;
}): Promise<VerifiedStorePurchase> {
  if (process.env.ALLOW_MOBILE_STORE_TEST_PURCHASES === "true" && input.purchaseToken?.startsWith("test_")) {
    const productId = input.productId || getPrimaryMobileProductId();
    assertAllowedMobileProduct(productId);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    return {
      active: true,
      productId,
      transactionId: input.purchaseToken,
      googlePurchaseToken: input.purchaseToken,
      startDate: now,
      endDate,
      autoRenewing: true,
      environment: "sandbox",
    };
  }

  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.anonymous.smartbuildadminapp";
  const serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error("Google Play service account credentials are not configured.");
  if (!input.purchaseToken) throw new Error("Google purchase token is required.");

  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidpublisher = google.androidpublisher({ version: "v3", auth });
  const response = await androidpublisher.purchases.subscriptionsv2.get({
    packageName,
    token: input.purchaseToken,
  });

  const purchase = response.data as any;
  const lineItem = purchase.lineItems?.[0];
  const productId = String(lineItem?.productId || "");
  assertAllowedMobileProduct(productId);

  const endDate = new Date(lineItem?.expiryTime || 0);
  const startDate = new Date(purchase.startTime || Date.now());
  const state = String(purchase.subscriptionState || "");

  return {
    active: ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"].includes(state) && endDate > new Date(),
    productId,
    transactionId: purchase.latestOrderId || input.purchaseToken,
    googlePurchaseToken: input.purchaseToken,
    startDate,
    endDate,
    autoRenewing: lineItem?.autoRenewingPlan?.autoRenewEnabled ?? null,
    environment: "production",
  };
}

async function verifyStorePurchase(platform: StorePlatform, body: any): Promise<VerifiedStorePurchase> {
  if (platform === "ios") {
    return verifyApplePurchase({
      productId: body.productId,
      transactionId: body.transactionId,
      signedTransactionInfo: body.signedTransactionInfo,
    });
  }

  return verifyGooglePurchase({
    productId: body.productId,
    purchaseToken: body.purchaseToken || body.googlePurchaseToken,
  });
}

async function updateExistingStoreSubscription(input: {
  billingProvider: "apple" | "google";
  purchase: VerifiedStorePurchase;
  paymentFailed?: boolean;
}) {
  const where =
    input.billingProvider === "apple"
      ? {
          OR: [
            { storeOriginalTransactionId: input.purchase.originalTransactionId || undefined },
            { storeTransactionId: input.purchase.transactionId || undefined },
          ],
        }
      : { googlePurchaseToken: input.purchase.googlePurchaseToken || undefined };

  const subscription = await prisma.subscription.findFirst({
    where: {
      billingProvider: input.billingProvider,
      ...where,
    },
  });

  if (!subscription) return null;

  const isActive = input.purchase.active;
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      startDate: input.purchase.startDate,
      endDate: input.purchase.endDate,
      isActive,
      storeProductId: input.purchase.productId,
      storeTransactionId: input.purchase.transactionId || subscription.storeTransactionId,
      storeOriginalTransactionId:
        input.purchase.originalTransactionId || subscription.storeOriginalTransactionId,
      googlePurchaseToken: input.purchase.googlePurchaseToken || subscription.googlePurchaseToken,
      storeEnvironment: input.purchase.environment,
      autoRenewing: input.purchase.autoRenewing ?? subscription.autoRenewing,
      lastVerifiedAt: new Date(),
      paymentFailed: input.paymentFailed ?? !isActive,
      stripeSubscriptionCanceled:
        input.purchase.autoRenewing === false ? true : subscription.stripeSubscriptionCanceled,
    },
  });

  await prisma.company.update({
    where: { id: subscription.companyId },
    data: { mobileSubscriptionStatus: isActive ? "active" : "expired" },
  });

  return subscription;
}

async function getMobilePlan(productId?: string) {
  const productConfig = productId ? getMobileProductConfig(productId) : null;
  const configuredPlanId = productConfig?.planId || process.env.MOBILE_APP_PLAN_ID;
  if (configuredPlanId) {
    const plan = await prisma.plan.findUnique({
      where: { id: configuredPlanId },
      include: { permissionGroup: { include: { GroupPermissionsList: { select: { permission_id: true } } } } },
    });
    if (plan) return plan;
  }

  const plans = await prisma.plan.findMany({
    where: { isActive: true, isCampaign: false },
    include: { permissionGroup: { include: { GroupPermissionsList: { select: { permission_id: true } } } } },
    orderBy: [{ price: "asc" }, { createdAt: "desc" }],
  });

  const inferredPrice = productId ? inferMobilePlanPrice(productId) : null;
  const byInferredPrice = inferredPrice
    ? plans.find((plan) => Math.trunc(Number(plan.price || 0)) === inferredPrice)
    : null;
  if (byInferredPrice) return byInferredPrice;

  const byPrice = plans.find((plan) => Math.trunc(Number(plan.price || 0)) === 29);
  if (byPrice) return byPrice;

  const fallback = plans.find((plan) => plan.validityType !== "FREE") || plans[0];
  if (!fallback) throw new Error("Mobile app plan is not configured.");
  return fallback;
}

async function applyPermissionsToOffice(officeId: string, permissionIds: string[]) {
  await prisma.userPermission.deleteMany({ where: { office_id: officeId } });
  if (permissionIds.length === 0) return;
  await prisma.userPermission.createMany({
    data: permissionIds.map((permission_id) => ({
      office_id: officeId,
      permission_id,
      editAll: false,
    })),
  });
}

async function ensureCompanyPlanSetup(companyId: string, plan: Awaited<ReturnType<typeof getMobilePlan>>) {
  const permissionIds = plan.permissionGroup.GroupPermissionsList.map((item) => item.permission_id);

  await prisma.company.update({
    where: { id: companyId },
    data: {
      planId: plan.id,
      allowedEmployees: plan.allowedEmployees,
      mobileSubscriptionStatus: "active",
    },
  });

  const ownerOffice = await prisma.office.findFirst({ where: { company_id: companyId, name: "Owner" } });
  if (ownerOffice) await applyPermissionsToOffice(ownerOffice.id, permissionIds);

  const workerOffice = await prisma.office.findFirst({ where: { company_id: companyId, name: "Worker" } });
  if (!workerOffice) {
    await prisma.office.create({ data: { name: "Worker", company_id: companyId } });
  }

  let adminOffice = await prisma.office.findFirst({ where: { company_id: companyId, name: "Administrator" } });
  if (!adminOffice) {
    adminOffice = await prisma.office.create({ data: { name: "Administrator", company_id: companyId } });
  }
  await applyPermissionsToOffice(adminOffice.id, permissionIds);
  await grantOwnerFullAccessForCompany(companyId);
}

async function getCompanyStatus(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      Plan: {
        include: {
          permissionGroup: {
            include: {
              GroupPermissionsList: {
                include: { Permissions: true },
              },
            },
          },
        },
      },
    },
  });
  if (!company) throw new Error("Company not found.");

  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { startDate: "desc" },
  });

  const planInfo = company.Plan
    ? {
        id: company.Plan.id,
        name: company.Plan.name,
        validityType: company.Plan.validityType,
        validityDuration: company.Plan.validityDuration,
        stripePriceId: company.Plan.stripePriceId,
        stripeProductId: company.Plan.stripeProductId,
        isCampaign: company.Plan.isCampaign,
      }
    : null;

  let isExpired = true;
  let paymentFailed = false;
  let stripeSubscriptionCanceled = false;

  if (company.mobileSubscriptionStatus === "pending_subscription") {
    isExpired = true;
  } else if (!planInfo) {
    isExpired = true;
  } else if (planInfo.validityType === "FREE") {
    isExpired = subscription ? new Date(subscription.endDate) < new Date() : true;
  } else if (subscription) {
    isExpired = !subscription.isActive || new Date(subscription.endDate) < new Date();
    paymentFailed = subscription.paymentFailed;
    stripeSubscriptionCanceled = subscription.stripeSubscriptionCanceled;
  }

  const permissions = company.Plan?.permissionGroup?.GroupPermissionsList?.map((item) => item.Permissions.description) || [];

  return { company, subscription, planInfo, isExpired, paymentFailed, stripeSubscriptionCanceled, permissions };
}

async function buildAuthResponse(userId: string, companyId?: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      companies: {
        include: {
          company: true,
          office: {
            include: {
              userPermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
      office: true,
    },
  });
  if (!user) throw new Error("User not found.");

  const token = signJwt({ id: user.id, name: user.name, email: user.email });
  const selectedLink = companyId
    ? user.companies.find((link) => link.companyId === companyId)
    : user.companies.length === 1
      ? user.companies[0]
      : null;

  const companies = await Promise.all(
    user.companies.map(async (link) => ({
      id: link.company.id,
      name: link.company.name,
      avatar: link.company.avatar ? await getPresignedUrl(link.company.avatar) : null,
      attendanceMode: link.company.attendanceMode,
      tokenCompany: token,
      office: link.office,
    })),
  );

  if (!selectedLink) {
    return {
      msg: "Select a company to continue.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar ? await getPresignedUrl(user.avatar) : null,
        phone: user.phone,
        companies,
      },
    };
  }

  const status = await getCompanyStatus(selectedLink.companyId);
  if (status.isExpired) {
    throw new Error("Your company's subscription is not active.");
  }

  const officePermissions =
    selectedLink.office?.userPermissions?.map((item) => item.permission.description).filter(Boolean) || [];
  const permissions = resolveEffectivePermissions(
    status.permissions,
    officePermissions,
    selectedLink.office?.name,
  );

  return {
    msg: "Authentication completed successfully!",
    token,
    rules: selectedLink.office?.name,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar ? await getPresignedUrl(user.avatar) : null,
      document: user.document,
      city_and_state: user.city_and_state,
      office: selectedLink.office,
      phone: user.phone,
      hourly_price: user.hourly_price,
      profession: user.profession,
      attendanceMode: user.attendanceMode,
      clockOutMode: user.clockOutMode,
      projectVisibilityMode: user.projectVisibilityMode,
      company: {
        id: status.company.id,
        name: status.company.name,
        avatar: status.company.avatar ? await getPresignedUrl(status.company.avatar) : null,
        attendanceMode: status.company.attendanceMode,
      },
      companies,
      plan: status.planInfo,
      permissions,
      last_acess: user.last_acess,
      subscription: status.subscription,
      isExpired: status.isExpired,
      stripeSubscriptionCanceled: status.stripeSubscriptionCanceled,
      paymentFailed: status.paymentFailed,
    },
    subscription: status.subscription,
    isExpired: status.isExpired,
    stripeSubscriptionCanceled: status.stripeSubscriptionCanceled,
    paymentFailed: status.paymentFailed,
  };
}

async function createPendingCompanyUser(input: {
  companyName: string;
  name: string;
  email: string;
  phone?: string | null;
  password?: string | null;
  provider?: MobileProvider | null;
  identity?: VerifiedSocialProfile | null;
}) {
  const email = normalizeEmail(input.email);
  if (!input.companyName?.trim()) throw new Error("Company name is required.");
  if (!input.name?.trim()) throw new Error("Name is required.");
  if (!email) throw new Error("Email is required.");

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error("Email has already been registered in the system.");

  const passwordToHash = input.password || randomUUID();
  const hashedPassword = bcrypt.hashSync(passwordToHash, 10);

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.companyName.trim(),
        phone: input.phone || null,
        mobileSubscriptionStatus: "pending_subscription",
        mobileSignupProvider: input.provider || "password",
      },
    });

    const ownerOffice = await tx.office.create({
      data: { name: "Owner", company_id: company.id },
    });

    const user = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        document: null,
        phone: input.phone || null,
        city_and_state: null,
        rules: {},
        office_id: ownerOffice.id,
        password: hashedPassword,
        profession: null,
        company_id: company.id,
        onBoardingCompleted: false,
        ...OWNER_FULL_ACCESS_DATA,
      },
    });

    await tx.userCompany.create({
      data: {
        userId: user.id,
        companyId: company.id,
        office_id: ownerOffice.id,
      },
    });

    if (input.identity) {
      await tx.userAuthIdentity.create({
        data: {
          provider: input.identity.provider,
          providerUserId: input.identity.providerUserId,
          email: input.identity.email || email,
          emailVerified: input.identity.emailVerified,
          rawProfile: (input.identity.rawProfile || {}) as any,
          userId: user.id,
        },
      });
    }

    return { company, user, pendingToken: issuePendingToken(user.id, company.id) };
  });
}

export class MobileAuthController {
  async socialAuth(req: Request, res: Response) {
    try {
      const { provider, idToken, name } = req.body as {
        provider?: MobileProvider;
        idToken?: string;
        name?: string;
      };
      if (provider !== "google" && provider !== "apple") {
        return res.status(400).json({ error: "Invalid social provider." });
      }
      if (!idToken) return res.status(400).json({ error: "Social identity token is required." });

      const profile = await verifySocialProfile(provider, idToken, name);
      const identity = await prisma.userAuthIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: profile.provider,
            providerUserId: profile.providerUserId,
          },
        },
      });

      if (identity) {
        return res.json(await buildAuthResponse(identity.userId));
      }

      if (profile.email && profile.emailVerified) {
        const existingUser = await prisma.user.findUnique({ where: { email: profile.email } });
        if (existingUser) {
          await prisma.userAuthIdentity.create({
            data: {
              provider: profile.provider,
              providerUserId: profile.providerUserId,
              email: profile.email,
              emailVerified: profile.emailVerified,
              rawProfile: (profile.rawProfile || {}) as any,
              userId: existingUser.id,
            },
          });
          return res.json(await buildAuthResponse(existingUser.id));
        }
      }

      return res.status(200).json({
        requiresSignup: true,
        socialProfile: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
          emailVerified: profile.emailVerified,
          name: profile.name,
        },
      });
    } catch (error: any) {
      console.error("[MobileAuth.socialAuth]", error);
      return res.status(400).json({ error: error.message || "Could not authenticate social account." });
    }
  }

  async registerMobile(req: Request, res: Response) {
    try {
      const { companyName, company_name, name, email, phone, password } = req.body;
      if (!password || String(password).length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }

      const result = await createPendingCompanyUser({
        companyName: companyName || company_name,
        name,
        email,
        phone,
        password,
      });

      return res.status(201).json({
        requiresSubscription: true,
        pendingToken: result.pendingToken,
        userId: result.user.id,
        companyId: result.company.id,
        productId: getPrimaryMobileProductId(),
        productIds: getMobileProductIds(),
      });
    } catch (error: any) {
      console.error("[MobileAuth.registerMobile]", error);
      return res.status(400).json({ error: error.message || "Could not create account." });
    }
  }

  async socialRegisterMobile(req: Request, res: Response) {
    try {
      const { provider, idToken, companyName, company_name, name, email, phone } = req.body as any;
      if (provider !== "google" && provider !== "apple") {
        return res.status(400).json({ error: "Invalid social provider." });
      }
      if (!idToken) return res.status(400).json({ error: "Social identity token is required." });

      const profile = await verifySocialProfile(provider, idToken, name);
      const identityExists = await prisma.userAuthIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: profile.provider,
            providerUserId: profile.providerUserId,
          },
        },
      });
      if (identityExists) return res.status(409).json({ error: "This social account is already linked." });

      const result = await createPendingCompanyUser({
        companyName: companyName || company_name,
        name: name || profile.name || profile.email || "SmartBuild User",
        email: email || profile.email,
        phone,
        provider,
        identity: profile,
      });

      return res.status(201).json({
        requiresSubscription: true,
        pendingToken: result.pendingToken,
        userId: result.user.id,
        companyId: result.company.id,
        productId: getPrimaryMobileProductId(),
        productIds: getMobileProductIds(),
      });
    } catch (error: any) {
      console.error("[MobileAuth.socialRegisterMobile]", error);
      return res.status(400).json({ error: error.message || "Could not create social account." });
    }
  }

  async verifyPurchase(req: Request, res: Response) {
    try {
      const { pendingToken, platform } = req.body as { pendingToken?: string; platform?: StorePlatform };
      if (platform !== "ios" && platform !== "android") {
        return res.status(400).json({ error: "Invalid store platform." });
      }

      const pending = verifyPendingToken(pendingToken);
      const purchase = await verifyStorePurchase(platform, req.body);
      if (!purchase.active) return res.status(402).json({ error: "Subscription is not active." });
      const plan = await getMobilePlan(purchase.productId);

      await prisma.$transaction(async (tx) => {
        await tx.subscription.updateMany({
          where: { companyId: pending.companyId, isActive: true },
          data: { isActive: false },
        });

        await tx.subscription.create({
          data: {
            companyId: pending.companyId,
            planId: plan.id,
            startDate: purchase.startDate,
            endDate: purchase.endDate,
            isActive: true,
            billingProvider: platform === "ios" ? "apple" : "google",
            storeProductId: purchase.productId,
            storeTransactionId: purchase.transactionId || null,
            storeOriginalTransactionId: purchase.originalTransactionId || null,
            googlePurchaseToken: purchase.googlePurchaseToken || null,
            storeEnvironment: purchase.environment,
            autoRenewing: purchase.autoRenewing ?? null,
            lastVerifiedAt: new Date(),
            paymentFailed: false,
            stripeSubscriptionCanceled: false,
          },
        });
      });

      await ensureCompanyPlanSetup(pending.companyId, plan);
      return res.json(await buildAuthResponse(pending.userId, pending.companyId));
    } catch (error: any) {
      console.error("[MobileAuth.verifyPurchase]", error);
      return res.status(400).json({ error: error.message || "Could not verify purchase." });
    }
  }

  async restorePurchase(req: Request, res: Response) {
    try {
      const { platform, companyId } = req.body as { platform?: StorePlatform; companyId?: string };
      if (platform !== "ios" && platform !== "android") {
        return res.status(400).json({ error: "Invalid store platform." });
      }

      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication is required to restore purchases." });

      const userCompany = companyId
        ? await prisma.userCompany.findUnique({ where: { userId_companyId: { userId, companyId } } })
        : await prisma.userCompany.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });

      if (!userCompany) return res.status(404).json({ error: "Company not found for this user." });

      const purchase = await verifyStorePurchase(platform, req.body);
      if (!purchase.active) return res.status(402).json({ error: "Subscription is not active." });
      const plan = await getMobilePlan(purchase.productId);

      await prisma.$transaction(async (tx) => {
        await tx.subscription.updateMany({
          where: { companyId: userCompany.companyId, isActive: true },
          data: { isActive: false },
        });
        await tx.subscription.create({
          data: {
            companyId: userCompany.companyId,
            planId: plan.id,
            startDate: purchase.startDate,
            endDate: purchase.endDate,
            isActive: true,
            billingProvider: platform === "ios" ? "apple" : "google",
            storeProductId: purchase.productId,
            storeTransactionId: purchase.transactionId || null,
            storeOriginalTransactionId: purchase.originalTransactionId || null,
            googlePurchaseToken: purchase.googlePurchaseToken || null,
            storeEnvironment: purchase.environment,
            autoRenewing: purchase.autoRenewing ?? null,
            lastVerifiedAt: new Date(),
            paymentFailed: false,
            stripeSubscriptionCanceled: false,
          },
        });
      });
      await ensureCompanyPlanSetup(userCompany.companyId, plan);

      return res.json(await buildAuthResponse(userId, userCompany.companyId));
    } catch (error: any) {
      console.error("[MobileAuth.restorePurchase]", error);
      return res.status(400).json({ error: error.message || "Could not restore purchase." });
    }
  }

  async registerDevice(req: Request, res: Response) {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication is required." });

      const { deviceId, platform, label } = req.body;
      if (!deviceId) return res.status(400).json({ error: "Device id is required." });

      const deviceToken = randomBytes(48).toString("base64url");
      await prisma.userDeviceCredential.upsert({
        where: { userId_deviceId: { userId, deviceId } },
        create: {
          userId,
          deviceId,
          platform,
          label,
          tokenHash: hashSecret(deviceToken),
        },
        update: {
          platform,
          label,
          tokenHash: hashSecret(deviceToken),
          revokedAt: null,
        },
      });

      return res.status(201).json({ deviceToken });
    } catch (error: any) {
      console.error("[MobileAuth.registerDevice]", error);
      return res.status(400).json({ error: error.message || "Could not register device." });
    }
  }

  async loginDevice(req: Request, res: Response) {
    try {
      const { deviceId, deviceToken, companyId } = req.body;
      if (!deviceId || !deviceToken) {
        return res.status(400).json({ error: "Device id and token are required." });
      }

      const credential = await prisma.userDeviceCredential.findFirst({
        where: {
          deviceId,
          tokenHash: hashSecret(deviceToken),
          revokedAt: null,
        },
      });
      if (!credential) return res.status(401).json({ error: "Invalid biometric credential." });

      await prisma.userDeviceCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      });

      return res.json(await buildAuthResponse(credential.userId, companyId));
    } catch (error: any) {
      console.error("[MobileAuth.loginDevice]", error);
      return res.status(400).json({ error: error.message || "Could not login with device." });
    }
  }

  async revokeDevice(req: Request, res: Response) {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication is required." });
      const { deviceId } = req.body;
      if (!deviceId) return res.status(400).json({ error: "Device id is required." });

      await prisma.userDeviceCredential.updateMany({
        where: { userId, deviceId },
        data: { revokedAt: new Date() },
      });
      return res.status(204).send();
    } catch (error: any) {
      console.error("[MobileAuth.revokeDevice]", error);
      return res.status(400).json({ error: error.message || "Could not revoke device." });
    }
  }

  async appleWebhook(req: Request, res: Response) {
    try {
      const { signedPayload } = req.body as { signedPayload?: string };
      if (!signedPayload) return res.status(400).json({ error: "Missing Apple signed payload." });

      const notification = decodeJwtPayload<any>(signedPayload);
      const transactionJws = notification?.data?.signedTransactionInfo;
      if (!transactionJws) return res.status(200).json({ received: true, ignored: true });

      const purchase = await verifyApplePurchase({ signedTransactionInfo: transactionJws });
      const notificationType = String(notification.notificationType || "");
      const paymentFailed = notificationType === "DID_FAIL_TO_RENEW";
      const inactiveTypes = new Set(["EXPIRED", "REFUND", "REVOKE"]);

      await updateExistingStoreSubscription({
        billingProvider: "apple",
        purchase: { ...purchase, active: purchase.active && !inactiveTypes.has(notificationType) },
        paymentFailed,
      });

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("[MobileAuth.appleWebhook]", error);
      return res.status(200).json({ received: true, error: error.message || "Apple webhook ignored." });
    }
  }

  async googleWebhook(req: Request, res: Response) {
    try {
      const messageData = req.body?.message?.data;
      if (!messageData) return res.status(400).json({ error: "Missing Google Pub/Sub message data." });

      const payload = JSON.parse(Buffer.from(messageData, "base64").toString("utf8"));
      const subscriptionNotification = payload.subscriptionNotification;
      const purchaseToken = subscriptionNotification?.purchaseToken;
      const notificationType = Number(subscriptionNotification?.notificationType || 0);

      if (!purchaseToken) return res.status(200).json({ received: true, ignored: true });

      const purchase = await verifyGooglePurchase({ purchaseToken });
      const inactiveTypes = new Set([5, 12, 13]);
      await updateExistingStoreSubscription({
        billingProvider: "google",
        purchase: { ...purchase, active: purchase.active && !inactiveTypes.has(notificationType) },
        paymentFailed: notificationType === 5,
      });

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("[MobileAuth.googleWebhook]", error);
      return res.status(200).json({ received: true, error: error.message || "Google webhook ignored." });
    }
  }
}
