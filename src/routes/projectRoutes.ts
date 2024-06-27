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




const projectRoutes = Router()

//costProject
const createInvoiceCostProjectController = new CreateInvoiceCostProjectController()
const uploadPhoto = multer(uploadConfig.upload("./public/tmp/costproject"))
projectRoutes.post("/invoicecostproject",
    checkToken,
    uploadPhoto.single("file"),
    compressImage("costproject"),
    createInvoiceCostProjectController.handle
)

const createCostProjectController = new CreateCostProjectController();
projectRoutes.post("/costproject", checkToken, createCostProjectController.handle);

const findCostProjectController = new FindCostProjectController();
projectRoutes.post("/costproject/find",checkToken,  findCostProjectController.handle);

const deleteCostProjectController = new DeleteCostProjectController()
projectRoutes.delete("/costProject",checkToken,  deleteCostProjectController.handle)


const updateInvoiceCostProjectController = new UpdateInvoiceCostProjectController()
projectRoutes.put("/invoicecostproject/:id", 
    checkToken,
    uploadPhoto.single("file"), 
    compressImage("costproject"), 
    updateInvoiceCostProjectController.handle
)
const updateCostProjectController = new UpdateCostProjectController();
projectRoutes.put("/costproject",checkToken, updateCostProjectController.handle)

export { projectRoutes }



