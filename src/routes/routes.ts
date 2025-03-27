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
import { companyRoutes } from './companyRoutes'

import { quickbooksRoutes } from './quickbooksRoutes'

import { changeOrderRoutes } from './changeOrderRoutes'


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
router.use("/change-order", changeOrderRoutes);

export { router }


