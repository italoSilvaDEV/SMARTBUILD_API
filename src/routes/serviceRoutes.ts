import { Router } from "express"
import { CreateServiceController } from "../controllers/service/CreateServiceController"
import { CreateCategoryController } from "../controllers/service/CreateCategoryController"
import multer from "multer";
import uploadConfig from "../config/upload";
import { compressImage } from "../config/compressImage";
import { UpdateImgCategoryController } from "../controllers/service/UpdateImgCategoryController";
import { CreateSubCategoryController } from "../controllers/service/CreateSubCategoryController";
import { UpdateCategoryController } from "../controllers/service/UpdateCategoryController";
import { DeleteServiceController } from "../controllers/service/DeleteServiceController";
import { UpdateServiceController } from "../controllers/service/UpdateServiceController";
import { UpdateSubCategoryController } from "../controllers/service/UpdateSubCategoryController";
import { DeleteSubCategoryController } from "../controllers/service/DeleteSubCategoryController";
import { DeleteCategoryController } from "../controllers/service/DeleteCategoryController";
import { FindCategoriesController } from "../controllers/service/FindCategoryController";
import { FindServiceController } from "../controllers/service/FindServiceController";
import { FindSubCategoryController } from "../controllers/service/FindSubcategoriaController";
import { UpdateCategoryTypeController } from "../controllers/service/UpdateCategoryTypeController";
import { checkToken } from "../middlewares/checkToken";
import { UserServiceProjectController } from "../controllers/service/UserServiceProjectController";



const serviceRoutes = Router()

//category
const createCategoryController = new CreateCategoryController()
const uploadPhoto = multer(uploadConfig.upload("./public/tmp/category"))
serviceRoutes.post("/category",
    // uploadPhoto.single("file"),
    // compressImage("category"),
    createCategoryController.handle.bind(createCategoryController)
)

//category put
const updateCategoryController = new UpdateCategoryController()
serviceRoutes.put("/category/alter", checkToken, updateCategoryController.handle)

const updateCategoryTypeController = new UpdateCategoryTypeController()
serviceRoutes.put("/category/type/alter", checkToken, updateCategoryTypeController.handle)


//putcategoryImg
const updateImgCategoryController = new UpdateImgCategoryController()
serviceRoutes.put("/category/img",
    checkToken,
    updateImgCategoryController.handle.bind(updateImgCategoryController)
)
serviceRoutes.patch("/category/name", checkToken, updateImgCategoryController.handleName)
serviceRoutes.patch("/category/status", checkToken, updateImgCategoryController.handleStatus)


const deleteCategoryController = new DeleteCategoryController();
serviceRoutes.delete("/category", checkToken, deleteCategoryController.handle);

const findCategoriesController = new FindCategoriesController();
serviceRoutes.post("/categories/find", checkToken, findCategoriesController.handle);


//subcategory
const createSubCategoryController = new CreateSubCategoryController()
serviceRoutes.post("/subcategory", checkToken, createSubCategoryController.handle)

const updateSubCategoryController = new UpdateSubCategoryController()
serviceRoutes.put("/subcategory", checkToken, updateSubCategoryController.handle)

const deleteSubCategoryController = new DeleteSubCategoryController()
serviceRoutes.delete("/subcategory/:sub_category_id", checkToken, deleteSubCategoryController.handle)

const findSubCategoryController = new FindSubCategoryController();
serviceRoutes.post("/subcategories/find", checkToken, findSubCategoryController.handle);


//service
const createServiceController = new CreateServiceController()
serviceRoutes.post("/service", checkToken, createServiceController.handle)


const updateServiceController = new UpdateServiceController()
serviceRoutes.put("/service", checkToken, updateServiceController.handle)

const deleteServiceController = new DeleteServiceController();
serviceRoutes.delete("/service/:service_id", checkToken, deleteServiceController.handle);

const findServiceController = new FindServiceController();
serviceRoutes.post("/service/find", checkToken, findServiceController.handle);
serviceRoutes.get('/service/company/:companyId', checkToken, findServiceController.getServicesByCompany);

const userServiceProjectController = new UserServiceProjectController()
serviceRoutes.post('/user_service_project', checkToken, userServiceProjectController.create);
serviceRoutes.get('/user_service_project/:id/:id_company', checkToken, userServiceProjectController.getById);
serviceRoutes.post("/user_service_project/search/:id", userServiceProjectController.getByUserWithSearch);
serviceRoutes.post('/services_with_details/:id', checkToken, userServiceProjectController.getServicesWithDetails);
serviceRoutes.get('/services/details-geral/:id', checkToken, userServiceProjectController.getServiceProjectDetailsGeral);

// custos do serviço app
serviceRoutes.get("/costs/:serviceProjectId", userServiceProjectController.getCostsByServiceProject);


export { serviceRoutes }



