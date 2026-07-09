import { Router } from "express";

import { MobileAuthController } from "../controllers/mobile/MobileAuthController";
import { checkToken } from "../middlewares/checkToken";

const mobileAuthRoutes = Router();
const mobileAuthController = new MobileAuthController();

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
