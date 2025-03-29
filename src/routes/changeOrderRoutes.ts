import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { ChangeOrderController } from "../controllers/projects/ChangeOrderController";

const changeOrderRoutes = Router();
const changeOrderController = new ChangeOrderController();

// Create a new change order
changeOrderRoutes.post("/", checkToken, changeOrderController.create);

// Get all change orders for a project
changeOrderRoutes.get("/project/:projectId", checkToken, changeOrderController.findByProject);

// Get a specific change order by ID
changeOrderRoutes.get("/:id", checkToken, changeOrderController.findById);

// Update a change order
changeOrderRoutes.put("/:id", checkToken, changeOrderController.update);

// Update change order status (pending, approved, rejected)
changeOrderRoutes.patch("/:id/status", checkToken, changeOrderController.updateStatus);

// Add client signature to approve a change order
changeOrderRoutes.patch("/:id/sign", changeOrderController.addSignature);

// Cancel a change order
changeOrderRoutes.put("/:id/cancel", checkToken, changeOrderController.cancel);

// Add service project to change order
changeOrderRoutes.post("/:id/service", checkToken, changeOrderController.addService);

// Remove service project from change order
changeOrderRoutes.delete("/:id/service/:serviceProjectId", checkToken, changeOrderController.removeService);

// Update service project in change order (quantity, price, etc.)
changeOrderRoutes.put("/:id/service/:serviceProjectId", checkToken, changeOrderController.updateService);

export { changeOrderRoutes }; 