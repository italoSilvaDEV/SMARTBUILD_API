import { Router } from 'express'
import { userRoutes } from './userRoutes'
import { serviceRoutes } from './serviceRoutes'
import { catalogRoutes } from './catalogRoutes'
import { projectRoutes } from './projectRoutes'
import { clientRoutes } from './clientRoutes'

const router = Router()

router.use(userRoutes)
router.use(serviceRoutes)
router.use(catalogRoutes)
router.use(projectRoutes)
router.use(clientRoutes)

export { router }


