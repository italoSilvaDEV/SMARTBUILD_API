import { requireCompanyResourceAccess as access, ref } from '../middlewares/companyResourceAccess';
import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/uploadUtf8";
import { CreateChangeOrderController } from "../controllers/changeOrder/createChangeOrderController";
import { SignChangeOrderController } from "../controllers/changeOrder/signChangeOrderController";
import { GetAllChangeOrderByProjectController } from "../controllers/changeOrder/getAllChangeOrderByProject";
import { GetChangeOrderController } from "../controllers/changeOrder/getChangeOrderController";
import { UpdateChangeOrderController } from "../controllers/changeOrder/updateChangeOrderController";
import { UpdateFullChangeOrderController } from "../controllers/changeOrder/updateFullChangeOrderController";
import { CreateChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/createChangeOrderServiceController";
import { DeleteChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/deleteChangeOrderServiceController";
import { GetChangeOrderServicesController } from "../controllers/changeOrder/changeOrderService/getChangeOrderServices";
import { UpdateChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/updateChangeOrderServiceController";
import { UpdatePdfChangeOrderController } from "../controllers/changeOrder/updatePdfChangeOrderController";
import { SendEmailChangeOrderController } from "../controllers/changeOrder/sendEmailChangeOrderController";
import { ManualApprovalChangeOrderController } from "../controllers/changeOrder/manualApprovalChangeOrderController";
import { RemoveManualSignatureChangeOrderController } from "../controllers/changeOrder/removeManualSignatureChangeOrderController";
import { DeleteChangeOrderController } from "../controllers/changeOrder/deleteChangeOrderController";

const changeOrderRoutes = Router();

const uploadAttachments = multer(uploadConfig.uploadUtf8("./public/tmp/change-order-attachments"));

const createChangeOrderController = new CreateChangeOrderController();
const signChangeOrderController = new SignChangeOrderController();
const getAllChangeOrderByProjectController = new GetAllChangeOrderByProjectController();
const getChangeOrderController = new GetChangeOrderController();
const updateChangeOrderController = new UpdateChangeOrderController();
const updateFullChangeOrderController = new UpdateFullChangeOrderController();
const updatePdfChangeOrderController = new UpdatePdfChangeOrderController();
const sendEmailChangeOrderController = new SendEmailChangeOrderController();
const manualApprovalChangeOrderController = new ManualApprovalChangeOrderController();
const removeManualSignatureChangeOrderController = new RemoveManualSignatureChangeOrderController();
const deleteChangeOrderController = new DeleteChangeOrderController();

const createChangeOrderServiceController = new CreateChangeOrderServiceController();
const deleteChangeOrderServiceController = new DeleteChangeOrderServiceController();
const getChangeOrderServicesController = new GetChangeOrderServicesController();
const updateChangeOrderServiceController = new UpdateChangeOrderServiceController();

changeOrderRoutes.post(
    "/create",
    checkToken,
    access('Estimates', [ref('estimate', 'body.estimateId'), ref('project', 'body.projectId'), ref('pdf', 'body.pdfId')]),
    createChangeOrderController.handle
);

changeOrderRoutes.post(
    "/sign",
    signChangeOrderController.handle
);

changeOrderRoutes.patch(
    "/:changeOrderId/manual-approval",
    checkToken,
    access('Estimates', [ref('changeOrder', 'params.changeOrderId')]),
    manualApprovalChangeOrderController.handle
);

changeOrderRoutes.patch(
    "/:changeOrderId/remove-manual-signature",
    checkToken,
    access('Estimates', [ref('changeOrder', 'params.changeOrderId')]),
    removeManualSignatureChangeOrderController.handle
);

changeOrderRoutes.get(
    "/by-project/:projectId",
    checkToken,
    access(['Estimates', 'Projects'], [ref('project', 'params.projectId')]),
    getAllChangeOrderByProjectController.handle
);

changeOrderRoutes.get(
    "/:changeOrderId",
    getChangeOrderController.handle
);

changeOrderRoutes.put(
    "/update",
    checkToken,
    access('Estimates', [ref('changeOrder', 'body.changeOrderId')]),
    updateChangeOrderController.handle
);

changeOrderRoutes.put(
    "/update-full",
    checkToken,
    access('Estimates', [ref('changeOrder', 'body.changeOrderId')]),
    updateFullChangeOrderController.handle
);

changeOrderRoutes.delete(
    "/:changeOrderId/company/:companyId",
    checkToken,
    access('Estimates', [ref('changeOrder', 'params.changeOrderId'), ref('company', 'params.companyId')]),
    deleteChangeOrderController.handle
);


changeOrderRoutes.post(
    "/service/create",
    checkToken,
    access('Estimates', [ref('changeOrder', 'body.changeOrderId')]),
    createChangeOrderServiceController.handle
);

changeOrderRoutes.get(
    "/service/:changeOrderId",
    checkToken,
    access('Estimates', [ref('changeOrder', 'params.changeOrderId')]),
    getChangeOrderServicesController.handle
);

changeOrderRoutes.put(
    "/service/update",
    checkToken,
    access('Estimates', [ref('changeOrderService', 'body.changeOrderServiceId')]),
    updateChangeOrderServiceController.handle
);

changeOrderRoutes.delete(
    "/service/:changeOrderServiceId",
    checkToken,
    access('Estimates', [ref('changeOrderService', 'params.changeOrderServiceId')]),
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
    access('Estimates', [ref('changeOrder', 'params.id')]),
    uploadAttachments.array("attachments", 10),
    sendEmailChangeOrderController.handle
);

export default changeOrderRoutes;
