import { requireMaster } from '../middlewares/requireMaster';
import { requireCompanyResourceAccess as access, ref } from '../middlewares/companyResourceAccess';
import { Router } from "express";
import { ExtraEmployeeSubscriptionController } from "../controllers/stripe/ExtraEmployeeSubscriptionController";
import { checkToken } from "../middlewares/checkToken";

export const extraEmployeeRoutes = Router();

/**
 * Routes for managing extra employee subscription items
 * Base path: /api/extra-employee
 */

// Get current extra employee price configuration (admin)
extraEmployeeRoutes.get("/config", checkToken, ExtraEmployeeSubscriptionController.getConfig);

// Update extra employee price (admin)
extraEmployeeRoutes.put("/price", checkToken, requireMaster, ExtraEmployeeSubscriptionController.updatePrice);

// Get extra employee status for a company
extraEmployeeRoutes.get("/company/:companyId", checkToken, access('User Management', [ref('company', 'params.companyId')]), ExtraEmployeeSubscriptionController.getExtraEmployeesStatus);

// Get extra paid users for a company
extraEmployeeRoutes.get("/company/:companyId/users", checkToken, access('User Management', [ref('company', 'params.companyId')]), ExtraEmployeeSubscriptionController.getExtraPaidUsers);

// Add extra employee seats to a company's subscription
extraEmployeeRoutes.post("/company/:companyId", checkToken, access('User Management', [ref('company', 'params.companyId')]), ExtraEmployeeSubscriptionController.addExtraEmployees);

// Remove extra employee seats from a company's subscription
extraEmployeeRoutes.post("/company/:companyId/reduce", checkToken, access('User Management', [ref('company', 'params.companyId')]), ExtraEmployeeSubscriptionController.reduceExtraEmployees);
