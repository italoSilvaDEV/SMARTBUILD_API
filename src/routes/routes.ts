import { Router } from 'express'
import { userRoutes } from './userRoutes'
import { serviceRoutes } from './serviceRoutes'
import { catalogRoutes } from './catalogRoutes'
import { projectRoutes } from './projectRoutes'
import { clientRoutes } from './clientRoutes'
import { workedRours } from './workedHours'
import {serviceStageRoutes} from './serviceStagesRoutes'
import { userAttendanceRoutes } from './userAttendanceRoutes'
import { stripeRoutes } from './stripeRoutes'
import { stripeWebHooksRoutes } from './stripeWebHooksRoutes'
import { financeDashboard } from './financeDashboardRoutes'
import { businessDashboard } from './businessDashboardRoutes'
import { companyRoutes } from './companyRoutes'
import { planRoutes } from './planRoutes'
import { permissionRoutes } from './permissionRoutes'
import { permissionGroupRoutes } from './permissionGroupRoutes'
import { subscriptionRoutes } from './subscriptionRoutes'

import { quickbooksRoutes } from './quickbooksRoutes'
import { invoiceRoutes } from "./invoiceRoutes"
import { customInvoiceRoutes } from "./customInvoiceRoutes"
import { invoicePaymentRoutes } from "./customInvoicePaymentRoutes"
import { invoiceStatisticsRoutes } from "./invoiceStatisticsRoutes"

import { estimateRoutes } from './estimateRoutes'


const router = Router()

// Importante: Colocar o webhook antes dos middlewares JSON
router.use(stripeWebHooksRoutes); // 🟢 Webhook configurado aqui

router.use(userRoutes)
router.use(companyRoutes)
router.use(serviceRoutes)
router.use(catalogRoutes)
router.use(projectRoutes)
router.use(clientRoutes)
router.use(workedRours)
router.use("/service-project-stages", serviceStageRoutes);
router.use(userAttendanceRoutes)
router.use(stripeRoutes)
router.use(quickbooksRoutes)
router.use("/finance-dashboard", financeDashboard);
router.use("/business-dashboard", businessDashboard);
router.use(invoiceRoutes);
router.use(customInvoiceRoutes);
router.use(invoicePaymentRoutes);
router.use(invoiceStatisticsRoutes);
router.use("/estimate", estimateRoutes);

// Novas rotas para planos e permissões
router.use(planRoutes)
router.use(permissionRoutes)
router.use(permissionGroupRoutes)
router.use(subscriptionRoutes)

export { router }


