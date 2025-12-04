import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { StartTutorialController } from "../controllers/tutorial/startTutorialController";
import { CompleteTutorialController } from "../controllers/tutorial/completeTutorialController";
import { GetUserProgressController } from "../controllers/tutorial/getUserProgressController";
import { GetTutorialProgressController } from "../controllers/tutorial/getTutorialProgressController";
import { GetModuleProgressController } from "../controllers/tutorial/getModuleProgressController";
import { ResetTutorialController } from "../controllers/tutorial/resetTutorialController";

const tutorialRoutes = Router();

const startTutorialController = new StartTutorialController();
const completeTutorialController = new CompleteTutorialController();
const getUserProgressController = new GetUserProgressController();
const getTutorialProgressController = new GetTutorialProgressController();
const getModuleProgressController = new GetModuleProgressController();
const resetTutorialController = new ResetTutorialController();

tutorialRoutes.use(checkToken);

tutorialRoutes.post("/tutorials/start", startTutorialController.handle.bind(startTutorialController));
tutorialRoutes.post("/tutorials/complete", completeTutorialController.handle.bind(completeTutorialController));
tutorialRoutes.get("/tutorials/progress", getUserProgressController.handle.bind(getUserProgressController));
tutorialRoutes.get("/tutorials/progress/:tutorialCode", getTutorialProgressController.handle.bind(getTutorialProgressController));
tutorialRoutes.get("/tutorials/module/:modulePrefix", getModuleProgressController.handle.bind(getModuleProgressController));
tutorialRoutes.delete("/tutorials/reset/:tutorialCode", resetTutorialController.handle.bind(resetTutorialController));

export { tutorialRoutes };

