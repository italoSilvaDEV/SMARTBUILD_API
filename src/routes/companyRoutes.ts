import { Router } from "express"
import { compressImage } from "../config/compressImage";
import { CompanyController } from "../controllers/company/CompanyController";
import { DeleteCompanyMasterController } from "../controllers/company/deleteCompanyMasterController";
import { checkToken } from "../middlewares/checkToken"
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";

const companyRoutes = Router()

const Company = new CompanyController()
const deleteMasterController = new DeleteCompanyMasterController();

const uploadPhoto = multer(uploadConfig.uploadUtf8("./public/tmp/company"))
//criar
companyRoutes.post("/company",
    // checkToken,
    compressImage("company"),
    Company.create)

companyRoutes.post("/company/master",
    checkToken,
    uploadPhoto.single("avatar"),
    compressImage("company"),
    Company.createAccountByMaster)

companyRoutes.put(
    "/company/update/:id",
    checkToken,
    uploadPhoto.single("avatar"), // Handles the file upload and stores it temporarily    
    compressImage("company"),
    Company.updateCompanyData
);

companyRoutes.get('/company/:id', checkToken, Company.searchOneCompany);

companyRoutes.get('/company-details-contract/:id', checkToken, Company.searchOneCompanyNotes);

companyRoutes.get("/company",
    checkToken,
    Company.findMany)

companyRoutes.patch("/company/:id/archive", checkToken, Company.updateArchiveStatus);

companyRoutes.post('/company/:companyId/notes', checkToken, Company.createNote);
companyRoutes.put('/company/:companyId/notes/:noteId', checkToken, Company.updateNote);
companyRoutes.delete('/company/:companyId/notes/:noteId', checkToken, Company.deleteNote);
companyRoutes.get('/company/:companyId/notes', checkToken, Company.listNotes);

companyRoutes.get("/company/proxy/image", Company.proxyImage);

// Proxy de imagem por URI
companyRoutes.get("/service/proxy/image-by-uri", Company.proxyImageByUri);

companyRoutes.post("/company/master-delete/request", checkToken, deleteMasterController.requestDeletion);
companyRoutes.post("/company/master-delete/confirm", checkToken, deleteMasterController.confirmDeletion);

// Atualizar company e usuário administrador
companyRoutes.put(
    "/company/:id",
    checkToken,
    uploadPhoto.single("avatar"),
    compressImage("company"),
    Company.updateCompanyAndUser
);

export { companyRoutes }