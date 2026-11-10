import { Router } from "express";

import { MobileAuthController } from "../controllers/mobile/MobileAuthController";
import { checkToken } from "../middlewares/checkToken";
import { AndroidBillingController } from "../controllers/mobile/AndroidBillingController";
import { GooglePlayCatalogController } from "../controllers/mobile/GooglePlayCatalogController";

const mobileAuthRoutes = Router();
const mobileAuthController = new MobileAuthController();
const androidBillingController = new AndroidBillingController();
const googlePlayCatalog = new GooglePlayCatalogController();
mobileAuthRoutes.post("/mobile-subscriptions/apple/begin", mobileAuthController.beginApplePurchase.bind(mobileAuthController));
mobileAuthRoutes.post("/android-billing/native/begin", googlePlayCatalog.begin.bind(googlePlayCatalog));
mobileAuthRoutes.post("/mobile-subscriptions/cancel-attempt", googlePlayCatalog.cancelAttempt.bind(googlePlayCatalog));
mobileAuthRoutes.post("/android-billing/native/cancel-attempt", googlePlayCatalog.cancelAttempt.bind(googlePlayCatalog));

mobileAuthRoutes.post("/android-billing/native/configuration", googlePlayCatalog.configuration.bind(googlePlayCatalog));
mobileAuthRoutes.post("/android-billing/native/status", googlePlayCatalog.status.bind(googlePlayCatalog));

mobileAuthRoutes.get("/android-billing/configuration", androidBillingController.configuration.bind(androidBillingController));
mobileAuthRoutes.post("/android-billing/checkout", androidBillingController.checkout.bind(androidBillingController));
mobileAuthRoutes.post("/android-billing/status", androidBillingController.status.bind(androidBillingController));
mobileAuthRoutes.post("/android-billing/replacement-context", androidBillingController.replacementContext.bind(androidBillingController));
mobileAuthRoutes.get("/android-billing/return", androidBillingController.returnToApp.bind(androidBillingController));

mobileAuthRoutes.post("/auth/social", mobileAuthController.socialAuth.bind(mobileAuthController));
mobileAuthRoutes.post("/auth/register/mobile", mobileAuthController.registerMobile.bind(mobileAuthController));
mobileAuthRoutes.post("/auth/social/register/mobile", mobileAuthController.socialRegisterMobile.bind(mobileAuthController));
mobileAuthRoutes.post("/mobile-subscriptions/verify-purchase", mobileAuthController.verifyPurchase.bind(mobileAuthController));
mobileAuthRoutes.post("/mobile-subscriptions/restore", checkToken, mobileAuthController.restorePurchase.bind(mobileAuthController));
mobileAuthRoutes.post("/mobile-subscriptions/webhooks/apple", mobileAuthController.appleWebhook.bind(mobileAuthController));
mobileAuthRoutes.post("/mobile-subscriptions/webhooks/google", mobileAuthController.googleWebhook.bind(mobileAuthController));
mobileAuthRoutes.post("/auth/device/register", checkToken, mobileAuthController.registerDevice.bind(mobileAuthController));
mobileAuthRoutes.post("/auth/device/login", mobileAuthController.loginDevice.bind(mobileAuthController));
mobileAuthRoutes.post("/auth/device/revoke", checkToken, mobileAuthController.revokeDevice.bind(mobileAuthController));

export { mobileAuthRoutes };
