import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { BidRequestController } from "../controllers/bidRequests/BidRequestController";

const bidRequestRoutes = Router();
const controller = new BidRequestController();

bidRequestRoutes.get("/public/:publicToken", controller.getPublic.bind(controller));
bidRequestRoutes.put("/public/:publicToken/submit", controller.submitPublic.bind(controller));
bidRequestRoutes.use(checkToken);
bidRequestRoutes.get("/", controller.list.bind(controller));
bidRequestRoutes.post("/", controller.create.bind(controller));
bidRequestRoutes.post("/:id/external-proposals/extract", controller.extractExternalProposal.bind(controller));
bidRequestRoutes.post("/:id/external-proposals", controller.createExternalProposal.bind(controller));
bidRequestRoutes.get("/:id", controller.get.bind(controller));
bidRequestRoutes.post("/:id/send", controller.send.bind(controller));
bidRequestRoutes.patch("/:id/cancel", controller.cancel.bind(controller));
bidRequestRoutes.post("/:id/recipients/:recipientId/approve", controller.approve.bind(controller));

export { bidRequestRoutes };
