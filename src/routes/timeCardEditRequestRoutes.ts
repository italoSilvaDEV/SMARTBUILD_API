import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { TimeCardEditRequestController } from "../controllers/TimeCards/TimeCardEditRequestController";

const timeCardEditRequestRoutes = Router();
const timeCardEditRequestController = new TimeCardEditRequestController();

timeCardEditRequestRoutes.post(
  "/timecard-edit-requests",
  checkToken,
  timeCardEditRequestController.create.bind(timeCardEditRequestController)
);

timeCardEditRequestRoutes.get(
  "/timecard-edit-requests/my",
  checkToken,
  timeCardEditRequestController.listMine.bind(timeCardEditRequestController)
);

timeCardEditRequestRoutes.get(
  "/timecard-edit-requests/company/:companyId",
  checkToken,
  timeCardEditRequestController.listByCompany.bind(timeCardEditRequestController)
);

timeCardEditRequestRoutes.put(
  "/timecard-edit-requests/:id/review",
  checkToken,
  timeCardEditRequestController.review.bind(timeCardEditRequestController)
);

export { timeCardEditRequestRoutes };
