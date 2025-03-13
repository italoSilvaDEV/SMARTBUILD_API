import { Router } from 'express';
import { UserAttendanceController } from '../controllers/User/UserAttendanceController';
import { checkToken } from '../middlewares/checkToken';
import { TimeLineController } from '../controllers/User/TimeLineController';
const userAttendanceControlller = new UserAttendanceController()
const timeLineController = new TimeLineController()
const userAttendanceRoutes = Router();

userAttendanceRoutes.post('/check-in', checkToken, userAttendanceControlller.checkIn);
userAttendanceRoutes.post('/check-out/:id', checkToken, userAttendanceControlller.checkOut);
userAttendanceRoutes.get('/user-attendance/:userId', checkToken, userAttendanceControlller.getAllByUser);

// Rota para buscar registros ativos (check-in feito, sem check-out)
userAttendanceRoutes.get(
    '/user-attendance/active/:userId',
    checkToken,
    userAttendanceControlller.getActiveAttendancesByUser
);

userAttendanceRoutes.get(
    "/attendance-all",
    checkToken,
    userAttendanceControlller.getAttendanceByUserAndService
);

userAttendanceRoutes.put('/user-attendance/:id/update-times', userAttendanceControlller.updateAttendanceTimes);

userAttendanceRoutes.post('/time-line/check-in', checkToken, timeLineController.handleTimeLine);
userAttendanceRoutes.post('/time-line/check-in-client', checkToken, timeLineController.handleTimeLineClient);

export { userAttendanceRoutes };
