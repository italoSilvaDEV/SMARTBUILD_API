import { Router } from "express"
import { checkToken } from "../middlewares/checkToken";
import { FinanceDashboardController } from "../controllers/dashboard/FinanceDashboardController";

const financeDashboard = Router()
const financeDashboardController = new FinanceDashboardController();
financeDashboard.get("/cashflow", checkToken, financeDashboardController.cashflow);
financeDashboard.get("/expenses", checkToken, financeDashboardController.expenses);
financeDashboard.get("/profit-loss", checkToken, financeDashboardController.profitLoss);
financeDashboard.get("/project", checkToken, financeDashboardController.project);
financeDashboard.get("/sales", checkToken, financeDashboardController.sales);
financeDashboard.get("/indicators", checkToken, financeDashboardController.indicators);

export { financeDashboard }



