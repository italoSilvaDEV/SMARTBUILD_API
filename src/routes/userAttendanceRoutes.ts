import { Router } from 'express';
import { UserAttendanceController } from '../controllers/User/UserAttendanceController';
import { checkToken } from '../middlewares/checkToken';
import { TimeLineController } from '../controllers/User/TimeLineController';
import { WorkerTrackingController } from '../controllers/tracking/WorkerTrackingController';
const userAttendanceControlller = new UserAttendanceController()
const timeLineController = new TimeLineController()
const workerTrackingController = new WorkerTrackingController()
const userAttendanceRoutes = Router();

userAttendanceRoutes.post('/check-in', checkToken, userAttendanceControlller.checkIn.bind(userAttendanceControlller));
userAttendanceRoutes.post('/check-out/:id', checkToken, userAttendanceControlller.checkOut.bind(userAttendanceControlller));
userAttendanceRoutes.post('/user-attendance/:attendanceId/break/start', checkToken, userAttendanceControlller.startBreak.bind(userAttendanceControlller));
userAttendanceRoutes.post('/user-attendance/:attendanceId/break/end', checkToken, userAttendanceControlller.endBreak.bind(userAttendanceControlller));
userAttendanceRoutes.post('/check-in-pending-service', checkToken, userAttendanceControlller.checkInPendingServiceSelection.bind(userAttendanceControlller));
userAttendanceRoutes.get('/user-attendance/:userId', checkToken, userAttendanceControlller.getAllByUser.bind(userAttendanceControlller));

// Nova rota para registrar clock in/out em um único endpoint
userAttendanceRoutes.post('/user-attendance/clock-in-out', checkToken, userAttendanceControlller.clockInOut.bind(userAttendanceControlller));

// Rota para buscar registros ativos (check-in feito, sem check-out)
userAttendanceRoutes.get(
    '/user-attendance/active/:userId',
    checkToken,
    userAttendanceControlller.getActiveAttendancesByUser.bind(userAttendanceControlller)
);

userAttendanceRoutes.get(
    "/attendance-all",
    checkToken,
    userAttendanceControlller.getAttendanceByUserAndService.bind(userAttendanceControlller)
);

userAttendanceRoutes.put('/user-attendance/:id/update-times', userAttendanceControlller.updateAttendanceTimes.bind(userAttendanceControlller));

userAttendanceRoutes.post('/time-line/check-in', checkToken, timeLineController.handleTimeLine.bind(timeLineController));
userAttendanceRoutes.post('/time-line/check-in-client', checkToken, timeLineController.handleTimeLineClient.bind(timeLineController));
userAttendanceRoutes.get('/time-line/by-worker/:user_service_project_id/:date', checkToken, timeLineController.handleTimeLineByWorker.bind(timeLineController));
userAttendanceRoutes.get('/time-line/live/company/:companyId', checkToken, timeLineController.handleLiveTrackingByCompany.bind(timeLineController));
userAttendanceRoutes.delete('/time-line/:id', checkToken,  timeLineController.deleteTimeline.bind(timeLineController));

// Nova rota para mudança de projeto
userAttendanceRoutes.put('/user-attendance/change-project/:attendanceId', checkToken, userAttendanceControlller.changeProject.bind(userAttendanceControlller)); 
userAttendanceRoutes.put('/user-attendance/select-service/:attendanceId', checkToken, userAttendanceControlller.selectServiceForAttendance.bind(userAttendanceControlller));

// Nova rota para listar projetos disponíveis para check-in (sem necessidade de estar atribuído)
userAttendanceRoutes.get('/available-projects-for-checkin', checkToken, userAttendanceControlller.getAvailableProjectsForCheckIn.bind(userAttendanceControlller));

// Nova rota para check-in simplificado (aceita serviceProjectId diretamente)
userAttendanceRoutes.post('/check-in-by-service', checkToken, userAttendanceControlller.checkInByServiceProject.bind(userAttendanceControlller));

// Nova rota para salvar lote de timeline
userAttendanceRoutes.post('/timeline/batch', checkToken, userAttendanceControlller.saveTimelineBatch.bind(userAttendanceControlller));
userAttendanceRoutes.post('/tracking/ping', checkToken, workerTrackingController.handlePing.bind(workerTrackingController));
userAttendanceRoutes.get('/tracking/history/worker/:workerId', checkToken, workerTrackingController.handleHistoryByWorker.bind(workerTrackingController));
userAttendanceRoutes.post('/tracking/reminder/ack', checkToken, workerTrackingController.acknowledgeReminder.bind(workerTrackingController));

// Nova rota para resumo de tempo dentro/fora
userAttendanceRoutes.get('/user-attendance/:id/summary', checkToken, userAttendanceControlller.getAttendanceSummary.bind(userAttendanceControlller));

export { userAttendanceRoutes };
