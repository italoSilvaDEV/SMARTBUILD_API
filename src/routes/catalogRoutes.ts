import { Router } from "express"
import multer from "multer";
import uploadConfig from "../config/upload";
import { compressImage } from "../config/compressImage";
import { UpdateImgCategoryController } from "../controllers/service/UpdateImgCategoryController";
import { checkToken } from "../middlewares/checkToken";
import { CreateCatalogController } from "../controllers/catalog/CreateCatalogController";
import { UpdateCatalogController } from "../controllers/catalog/UpdateCatalogController";



const catalogRoutes = Router()

//category
const createCatalogController = new CreateCatalogController()
const uploadPhoto = multer(uploadConfig.upload("./public/tmp/catalog"))
catalogRoutes.post("/catalog", 
    uploadPhoto.single("file"), 
    compressImage("catalog"), 
    createCatalogController.handle
)

//category put
// const updateCategoryController = new UpdateCategoryController()
// catalogRoutes.put("/category/alter", checkToken, updateCategoryController.handle)

// const updateCategoryTypeController = new UpdateCategoryTypeController()
// catalogRoutes.put("/category/type/alter", checkToken, updateCategoryTypeController.handle)


//putcategoryImg
const updateCatalogController = new UpdateCatalogController()
catalogRoutes.put("/catalog/:id", 
    checkToken,
    uploadPhoto.single("file"), 
    compressImage("catalog"), 
    updateCatalogController.handle
)




export { catalogRoutes }



