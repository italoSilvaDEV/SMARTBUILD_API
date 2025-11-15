import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { CreateChangeOrderController } from "../controllers/changeOrder/createChangeOrderController";
import { SignChangeOrderController } from "../controllers/changeOrder/signChangeOrderController";
import { GetAllChangeOrderByEstimateController } from "../controllers/changeOrder/getAllChangeOrderByEstimate";
import { GetChangeOrderController } from "../controllers/changeOrder/getChangeOrderController";
import { UpdateChangeOrderController } from "../controllers/changeOrder/updateChangeOrderController";
import { CreateChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/createChangeOrderServiceController";
import { DeleteChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/deleteChangeOrderServiceController";
import { GetChangeOrderServicesController } from "../controllers/changeOrder/changeOrderService/getChangeOrderServices";
import { UpdateChangeOrderServiceController } from "../controllers/changeOrder/changeOrderService/updateChangeOrderServiceController";
import { UpdatePdfChangeOrderController } from "../controllers/changeOrder/updatePdfChangeOrderController";

const changeOrderRoutes = Router();

const createChangeOrderController = new CreateChangeOrderController();
const signChangeOrderController = new SignChangeOrderController();
const getAllChangeOrderByEstimateController = new GetAllChangeOrderByEstimateController();
const getChangeOrderController = new GetChangeOrderController();
const updateChangeOrderController = new UpdateChangeOrderController();
const updatePdfChangeOrderController = new UpdatePdfChangeOrderController();

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
    checkToken,
    signChangeOrderController.handle
);

changeOrderRoutes.get(
    "/by-estimate/:estimateId",
    checkToken,
    getAllChangeOrderByEstimateController.handle
);

changeOrderRoutes.get(
    "/:changeOrderId",
    checkToken,
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

export default changeOrderRoutes;