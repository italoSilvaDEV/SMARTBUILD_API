import { Router } from "express"
import multer from "multer";
import uploadConfig from "../config/upload";
import { compressImage } from "../config/compressImage";
import { UpdateImgCategoryController } from "../controllers/service/UpdateImgCategoryController";
import { checkToken } from "../middlewares/checkToken";
import { CreateCatalogController } from "../controllers/catalog/CreateCatalogController";
import { UpdateCatalogController } from "../controllers/catalog/UpdateCatalogController";
import { CreateImgCatalogController } from "../controllers/catalog/CreateImgCatalogController";



const catalogRoutes = Router()

const createCatalogController = new CreateCatalogController();
catalogRoutes.post("/catalog", checkToken, createCatalogController.handle);

//category
const createImgCatalogController = new CreateImgCatalogController()
const uploadPhoto = multer(uploadConfig.upload("./public/tmp/catalog"))
catalogRoutes.post("/catalog/img", 
    uploadPhoto.single("file"), 
    compressImage("catalog"), 
    createImgCatalogController.handle
)

// const createCatalogController = new CreateCatalogController()
// const uploadPhoto = multer(uploadConfig.upload("./public/tmp/catalog"))
// catalogRoutes.post("/catalog", 
//     uploadPhoto.single("file"), 
//     compressImage("catalog"), 
//     createCatalogController.handle
// )

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



