import { Router } from 'express'
import { userRoutes } from './userRoutes'
import { serviceRoutes } from './serviceRoutes'

const router = Router()

router.use(userRoutes)
router.use(serviceRoutes)


export { router }


