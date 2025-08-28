import { Router } from "express"
import { checkToken } from "../middlewares/checkToken";
import { getAllController } from "../controllers/TimeCards/getAllController";
import { getByWorkerIdController } from "../controllers/TimeCards/getByWorkerIdController";

const timeCardsRouts = Router()

const getAllTimeCardsController = new getAllController();
const getAllByWorkerIdController = new getByWorkerIdController();

timeCardsRouts.get("/all/:companyId", checkToken, getAllTimeCardsController.handle);
timeCardsRouts.get("/worker/:companyId/:workerId", checkToken, getAllByWorkerIdController.handle);

export { timeCardsRouts }