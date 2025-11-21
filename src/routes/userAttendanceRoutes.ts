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

// Nova rota para registrar clock in/out em um único endpoint
userAttendanceRoutes.post('/user-attendance/clock-in-out', checkToken, userAttendanceControlller.clockInOut);

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
userAttendanceRoutes.get('/time-line/by-worker/:user_service_project_id/:date', checkToken, timeLineController.handleTimeLineByWorker);
userAttendanceRoutes.delete('/time-line/:id', checkToken,  timeLineController.deleteTimeline);

// Nova rota para mudança de projeto
userAttendanceRoutes.put('/user-attendance/change-project/:attendanceId', checkToken, userAttendanceControlller.changeProject); 

// Nova rota para listar projetos disponíveis para check-in (sem necessidade de estar atribuído)
userAttendanceRoutes.get('/available-projects-for-checkin', checkToken, userAttendanceControlller.getAvailableProjectsForCheckIn);

// Nova rota para check-in simplificado (aceita serviceProjectId diretamente)
userAttendanceRoutes.post('/check-in-by-service', checkToken, userAttendanceControlller.checkInByServiceProject);

export { userAttendanceRoutes };
