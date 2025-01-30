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

const router = Router()

router.use(userRoutes)
router.use(serviceRoutes)
router.use(catalogRoutes)
router.use(projectRoutes)
router.use(clientRoutes)
router.use(workedRours)
router.use("/service-project-stages", serviceStageRoutes);
router.use(userAttendanceRoutes)

router.use(stripeRoutes)

export { router }


