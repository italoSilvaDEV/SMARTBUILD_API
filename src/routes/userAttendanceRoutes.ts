import { Router } from 'express';
import { UserAttendanceController } from '../controllers/User/UserAttendanceController';
import { checkToken } from '../middlewares/checkToken';
const userAttendanceControlller = new UserAttendanceController()
const userAttendanceRoutes = Router();

userAttendanceRoutes.post('/check-in', checkToken, userAttendanceControlller.checkIn);
userAttendanceRoutes.post('/check-out/:id', checkToken, userAttendanceControlller.checkOut);
userAttendanceRoutes.get('/user-attendance/:userId', userAttendanceControlller.getAllByUser);

export { userAttendanceRoutes };
