import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";
import { CreateChangeOrderController } from "../controllers/changeOrder/createChangeOrderController";
import { SignChangeOrderController } from "../controllers/changeOrder/signChangeOrderController";
import { GetAllChangeOrderByProjectController } from "../controllers/changeOrder/getAllChangeOrderByProject";
import { GetChangeOrderController } from "../controllers/changeOrder/getChangeOrderController";
import { UpdateChangeOrderController } from "../controllers/changeOrder/updateChangeOrderController";
import { CreateChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/createChangeOrderServiceController";
import { DeleteChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/deleteChangeOrderServiceController";
import { GetChangeOrderServicesController } from "../controllers/changeOrder/changeOrderService/getChangeOrderServices";
import { UpdateChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/updateChangeOrderServiceController";
import { UpdatePdfChangeOrderController } from "../controllers/changeOrder/updatePdfChangeOrderController";
import { SendEmailChangeOrderController } from "../controllers/changeOrder/sendEmailChangeOrderController";
import { ManualApprovalChangeOrderController } from "../controllers/changeOrder/manualApprovalChangeOrderController";
import { RemoveManualSignatureChangeOrderController } from "../controllers/changeOrder/removeManualSignatureChangeOrderController";

const changeOrderRoutes = Router();

const uploadAttachments = multer(uploadConfig.uploadUtf8("./public/tmp/change-order-attachments"));

const createChangeOrderController = new CreateChangeOrderController();
const signChangeOrderController = new SignChangeOrderController();
const getAllChangeOrderByProjectController = new GetAllChangeOrderByProjectController();
const getChangeOrderController = new GetChangeOrderController();
const updateChangeOrderController = new UpdateChangeOrderController();
const updatePdfChangeOrderController = new UpdatePdfChangeOrderController();
const sendEmailChangeOrderController = new SendEmailChangeOrderController();
const manualApprovalChangeOrderController = new ManualApprovalChangeOrderController();
const removeManualSignatureChangeOrderController = new RemoveManualSignatureChangeOrderController();

const createChangeOrderServiceController = new CreateChangeOrderServiceController();
const deleteChangeOrderServiceController = new DeleteChangeOrderServiceController();
const getChangeOrderServicesController = new GetChangeOrderServicesController();
const updateChangeOrderServiceController = new UpdateChangeOrderServiceController();

changeOrderRoutes.post(
    "/create",
    checkToken,
    createChangeOrderController.handle
);

changeOrderRoutes.post(
    "/sign",
    signChangeOrderController.handle
);

changeOrderRoutes.patch(
    "/:changeOrderId/manual-approval",
    checkToken,
    manualApprovalChangeOrderController.handle
);

changeOrderRoutes.patch(
    "/:changeOrderId/remove-manual-signature",
    checkToken,
    removeManualSignatureChangeOrderController.handle
);

changeOrderRoutes.get(
    "/by-project/:projectId",
    checkToken,
    getAllChangeOrderByProjectController.handle
);

changeOrderRoutes.get(
    "/:changeOrderId",
    getChangeOrderController.handle
);

changeOrderRoutes.put(
    "/update",
    checkToken,
    updateChangeOrderController.handle
);


changeOrderRoutes.post(
    "/service/create",
    checkToken,
    createChangeOrderServiceController.handle
);

changeOrderRoutes.get(
    "/service/:changeOrderId",
    checkToken,
    getChangeOrderServicesController.handle
);

changeOrderRoutes.put(
    "/service/update",
    checkToken,
    updateChangeOrderServiceController.handle
);

changeOrderRoutes.delete(
    "/service/:changeOrderServiceId",
    checkToken,
    deleteChangeOrderServiceController.handle
);

changeOrderRoutes.put(
    "/pdf/update",
    checkToken,
    updatePdfChangeOrderController.handle
);

changeOrderRoutes.post(
    "/:id/send",
    checkToken,
    uploadAttachments.array("attachments", 10),
    sendEmailChangeOrderController.handle
);

export default changeOrderRoutes;