import { Router } from "express";
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";
import { checkToken } from "../middlewares/checkToken";
import { ContractController } from "../controllers/contracts/ContractController";

const contractRoutes = Router();
const contractController = new ContractController();

const uploadContractDocuments = multer({
  ...uploadConfig.uploadUtf8("./public/tmp/contracts"),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF files are allowed"));
  },
});

const uploadContractAttachments = multer({
  ...uploadConfig.uploadUtf8("./public/tmp/contract-email-attachments"),
  limits: { fileSize: 20 * 1024 * 1024 },
});

contractRoutes.get("/public/:publicToken", contractController.getPublic.bind(contractController));
contractRoutes.post("/public/:publicToken/verify-code", contractController.verifyCode.bind(contractController));
contractRoutes.post("/public/:publicToken/sign", contractController.signPublic.bind(contractController));

contractRoutes.get("/company/:companyId", checkToken, contractController.listByCompany.bind(contractController));
contractRoutes.get("/:id", checkToken, contractController.getById.bind(contractController));
contractRoutes.post("/", checkToken, uploadContractDocuments.array("documents", 10), contractController.create.bind(contractController));
contractRoutes.put("/:id", checkToken, uploadContractDocuments.array("documents", 10), contractController.update.bind(contractController));
contractRoutes.post("/:id/send", checkToken, uploadContractAttachments.array("attachments", 10), contractController.send.bind(contractController));
contractRoutes.post("/:id/reminder", checkToken, uploadContractAttachments.array("attachments", 10), contractController.reminder.bind(contractController));
contractRoutes.patch("/:id/cancel", checkToken, contractController.cancel.bind(contractController));
contractRoutes.delete("/:id", checkToken, contractController.delete.bind(contractController));

export default contractRoutes;
