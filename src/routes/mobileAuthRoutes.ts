import { Router } from "express";

import { MobileAuthController } from "../controllers/mobile/MobileAuthController";
import { checkToken } from "../middlewares/checkToken";
import { AndroidBillingController } from "../controllers/mobile/AndroidBillingController";

const mobileAuthRoutes = Router();
const mobileAuthController = new MobileAuthController();
const androidBillingController = new AndroidBillingController();

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
