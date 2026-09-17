import { Router } from "express";
import { PlanInviteController } from "../controllers/plans/PlanInviteController";
import { checkToken } from "../middlewares/checkToken";
import { requireMaster } from "../middlewares/requireMaster";

const planInviteRoutes = Router();
const controller = new PlanInviteController();

planInviteRoutes.get(
  "/master/plans/:planId/invite",
  checkToken,
  requireMaster,
  controller.getForPlan.bind(controller),
);
planInviteRoutes.post(
  "/master/plans/:planId/invite",
  checkToken,
  requireMaster,
  controller.create.bind(controller),
);
planInviteRoutes.delete(
  "/master/plans/:planId/invite",
  checkToken,
  requireMaster,
  controller.revoke.bind(controller),
);

planInviteRoutes.get(
  "/plan-invites/:token",
  controller.getPublic.bind(controller),
);
planInviteRoutes.post(
  "/plan-invites/:token/redeem",
  controller.redeem.bind(controller),
);

export { planInviteRoutes };
