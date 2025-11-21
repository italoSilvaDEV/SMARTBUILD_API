import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";
import { PdfInvoicePaidController } from "../controllers/invoice/pdfInvoiceController";

const fileRoutes = Router();

const uploadFile = multer(uploadConfig.upload("./public/tmp/files"));

const pdfInvoicePaidController = new PdfInvoicePaidController();
fileRoutes.post("/invoice/pdfpaid/create", checkToken, uploadFile.single("file"), pdfInvoicePaidController.create.bind(pdfInvoicePaidController)
);

fileRoutes.put("/invoice/pdfpaid/update", checkToken, uploadFile.single("file"), pdfInvoicePaidController.update.bind(pdfInvoicePaidController)
);

fileRoutes.delete("/invoice/pdfpaid/delete/:pdfId", checkToken, pdfInvoicePaidController.delete.bind(pdfInvoicePaidController)
);

fileRoutes.put("/invoice/pdfpaid/set-checked", checkToken, pdfInvoicePaidController.setChecked.bind(pdfInvoicePaidController)
);

export default fileRoutes;