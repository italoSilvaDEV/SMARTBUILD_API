import { Router } from "express";
import { ExtraEmployeeSubscriptionController } from "../controllers/stripe/ExtraEmployeeSubscriptionController";

export const extraEmployeeRoutes = Router();

/**
 * Routes for managing extra employee subscription items
 * Base path: /api/extra-employee
 */

// Get current extra employee price configuration (admin)
extraEmployeeRoutes.get("/config", ExtraEmployeeSubscriptionController.getConfig);

// Update extra employee price (admin)
extraEmployeeRoutes.put("/price", ExtraEmployeeSubscriptionController.updatePrice);

// Get extra employee status for a company
extraEmployeeRoutes.get("/company/:companyId", ExtraEmployeeSubscriptionController.getExtraEmployeesStatus);

// Get extra paid users for a company
extraEmployeeRoutes.get("/company/:companyId/users", ExtraEmployeeSubscriptionController.getExtraPaidUsers);

// Add extra employee seats to a company's subscription
extraEmployeeRoutes.post("/company/:companyId", ExtraEmployeeSubscriptionController.addExtraEmployees);

// Remove extra employee seats from a company's subscription
extraEmployeeRoutes.post("/company/:companyId/reduce", ExtraEmployeeSubscriptionController.reduceExtraEmployees);
