import { Router } from "express"
import multer from "multer";
import uploadConfig from "../config/upload";
import { compressImage } from "../config/compressImage";
import { checkToken } from "../middlewares/checkToken";
import { CreateCatalogController } from "../controllers/catalog/CreateCatalogController";
import { UpdateCatalogController } from "../controllers/catalog/UpdateCatalogController";
import { CreateImgCatalogController } from "../controllers/catalog/CreateImgCatalogController";
import { FindCatalogAllController } from "../controllers/catalog/FindCatalogAllController";
import { FindOneCatalogController } from "../controllers/catalog/FindOneCatalogController";
import { DeleteAllImgCatalogController } from "../controllers/catalog/deleteAllImgCatalogController";



const catalogRoutes = Router()


//catalog
const createCatalogController = new CreateCatalogController()
const uploadPhotoCatalog = multer(uploadConfig.upload("./public/tmp/catalog"))
catalogRoutes.post("/catalog", 
uploadPhotoCatalog.single("file"), 
    compressImage("catalog"), 
    createCatalogController.handle
)

const findCatalogAllController = new FindCatalogAllController()
catalogRoutes.post("/catalog/find",checkToken,  findCatalogAllController.handle);

const findOneCatalogController = new FindOneCatalogController()
catalogRoutes.get("/catalog/find/:id",checkToken,  findOneCatalogController.handle);

//Imgcatalog
const createImgCatalogController = new CreateImgCatalogController()
const uploadPhoto = multer(uploadConfig.upload("./public/tmp/catalogimg"))
catalogRoutes.post("/catalog/img", 
    uploadPhoto.single("file"), 
    compressImage("catalogimg"), 
    createImgCatalogController.handle
)

//putcatalogImg
const updateCatalogController = new UpdateCatalogController()
catalogRoutes.put("/catalog/:id", 
    checkToken,
    uploadPhoto.single("file"), 
    compressImage("catalog"), 
    updateCatalogController.handle
)

const deleteAllImgCatalogController = new DeleteAllImgCatalogController()
catalogRoutes.delete("/imgallcatalog",checkToken,  deleteAllImgCatalogController.handle)


export { catalogRoutes }



