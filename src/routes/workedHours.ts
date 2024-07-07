import { Router } from "express"
import multer from "multer";
import uploadConfig from "../config/upload";
import { compressImage } from "../config/compressImage";
import { checkToken } from "../middlewares/checkToken";
import { CreateInvoiceCostProjectController } from "../controllers/projects/CreateInvoiceCostProjectController";
import { CreateCostProjectController } from "../controllers/projects/CreateCostProjectController";
import { FindCostProjectController } from "../controllers/projects/FindCostProjectController";
import { DeleteCostProjectController } from "../controllers/projects/deleteCostProjectController";
import { UpdateInvoiceCostProjectController } from "../controllers/projects/UpdateInvoiceCostProjectController";
import { UpdateCostProjectController } from "../controllers/projects/UpdateCostProjectController";
import { CreateWorkedHoursController } from "../controllers/WorkedHours/CreateWorkedHoursController";
import { FindWorkedHoursProjectController } from "../controllers/WorkedHours/FindWorkedHoursProjectController";
import { UpdateWorkedHoursController } from "../controllers/WorkedHours/UpdateWorkedHoursController";
import { DeleteWorkedHoursController } from "../controllers/WorkedHours/DeleteWorkedHoursController";




const workedRours = Router()


const createWorkedHoursController = new CreateWorkedHoursController();
workedRours.post("/workedhours", checkToken, createWorkedHoursController.handle);

const findWorkedHoursProjectController = new FindWorkedHoursProjectController();
workedRours.post("/workedhours/find",checkToken,  findWorkedHoursProjectController.handle);

const deleteWorkedHoursController = new DeleteWorkedHoursController()
workedRours.delete("/workedhours/:id",checkToken,  deleteWorkedHoursController.handle)



const updateWorkedHoursController = new UpdateWorkedHoursController();
workedRours.put("/workedhours",checkToken, updateWorkedHoursController.handle)

export { workedRours }



