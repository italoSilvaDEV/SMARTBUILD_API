import { Router } from "express"
import { checkToken } from "../middlewares/checkToken";
import { CreateWorkedHoursController } from "../controllers/WorkedHours/CreateWorkedHoursController";
import { FindWorkedHoursProjectController } from "../controllers/WorkedHours/FindWorkedHoursProjectController";
import { UpdateWorkedHoursController } from "../controllers/WorkedHours/UpdateWorkedHoursController";
import { DeleteWorkedHoursController } from "../controllers/WorkedHours/DeleteWorkedHoursController";




const workedRours = Router()


const createWorkedHoursController = new CreateWorkedHoursController();
workedRours.post("/workedhours", checkToken, createWorkedHoursController.handle);

const findWorkedHoursProjectController = new FindWorkedHoursProjectController();
workedRours.post("/workedhours/find",checkToken,  findWorkedHoursProjectController.handle);
workedRours.post("/workedhours/find/overtime", checkToken, findWorkedHoursProjectController.handleGet);

const deleteWorkedHoursController = new DeleteWorkedHoursController()
workedRours.delete("/workedhours/:id",checkToken,  deleteWorkedHoursController.handle)



const updateWorkedHoursController = new UpdateWorkedHoursController();
workedRours.put("/workedhours",checkToken, updateWorkedHoursController.handle)

export { workedRours }



