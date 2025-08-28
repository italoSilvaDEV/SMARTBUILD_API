import { Router } from "express"
import { checkToken } from "../middlewares/checkToken";
import { getAllController } from "../controllers/TimeCards/getAllController";

const timeCardsRouts = Router()

const getAllTimeCardsController = new getAllController();

timeCardsRouts.get("all/:companyId", getAllTimeCardsController.handle);

export { timeCardsRouts }