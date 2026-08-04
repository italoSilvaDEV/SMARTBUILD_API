import { Router } from "express"
import { checkToken } from "../middlewares/checkToken";
import { BusinessDashboardController } from "../controllers/dashboard/BusinessDashboardController";

const businessDashboard = Router()
const businessDashboardController = new BusinessDashboardController();

// Mobile aggregate. Existing dashboard routes remain unchanged for the web app.
businessDashboard.get("/mobile-summary", checkToken, businessDashboardController.mobileSummary);

// Cards
businessDashboard.get("/cards", checkToken, businessDashboardController.dashboardCards);
businessDashboard.get("/cards/sparklines", checkToken, businessDashboardController.cardSparklines);

// Charts
businessDashboard.get("/charts/sales", checkToken, businessDashboardController.salesChart);
businessDashboard.get("/charts/sales/details", checkToken, businessDashboardController.salesChartDetails);
businessDashboard.get("/charts/expenses", checkToken, businessDashboardController.expenses);
businessDashboard.get("/charts/cashflow", checkToken, businessDashboardController.cashflowChart);
businessDashboard.get("/charts/invoices", checkToken, businessDashboardController.invoicesChart);
businessDashboard.get("/charts/projects", checkToken, businessDashboardController.projectsChart);
businessDashboard.get("/charts/estimates", checkToken, businessDashboardController.estimatesChart);

export { businessDashboard } 
