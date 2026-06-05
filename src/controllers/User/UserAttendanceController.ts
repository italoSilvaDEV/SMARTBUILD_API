import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { getPresignedUrl } from '../../utils/S3/getPresignedUrl';
import { SocketService } from '../../services/SocketService';

const prisma = new PrismaClient();
const attendanceService = new AttendanceService();

const emitLiveTrackingUpdate = (companyId: string | null | undefined, payload: Record<string, any>) => {
    if (!companyId) return;
    SocketService.emitToAll('live_tracking_updated', {
        companyId,
        ...payload,
        emittedAt: new Date().toISOString(),
    });
};

const formatActiveAttendance = (att: any) => {
    const serviceProject = att.UserServiceProject?.service_project;
    const project = serviceProject?.Project;
    const breaks = att.breakRecords || [];

    return {
        ...att,
        idServiceProject: serviceProject?.id || null,
        service_project_name: serviceProject?.name || att.pending_project_name || 'Pending service selection',
        project_id: project?.id || att.pending_project_id || null,
        work_radius: project?.radius || att.pending_project_radius || null,
        pending_service_selection: att.service_selection_status === 'pending',
        manualBreakEnabled: att.user?.manualBreakEnabled === true,
        activeBreak: breaks.find((breakRecord: any) => !breakRecord.endedAt) || null,
        breaks,
    };
};

export class UserAttendanceController {
    // Check-in consolidado (usado pelo App)
    async checkInByServiceProject(req: Request, res: Response): Promise<void> {
        try {
            const { user_id, service_project_id, address, latitude, longitude } = req.body;

            if (!user_id || !service_project_id) {
                res.status(400).json({ error: 'user_id and service_project_id are required.' });
                return;
            }

            const result = await attendanceService.processCheckIn({
                user_id,
                service_project_id,
                address,
                latitude,
                longitude
            });

            if (result.alreadyOpen) {
                res.status(400).json({
                    error: 'There is already an open attendance for this service.',
                    attendance_id: result.attendance.id
                });
                return;
            }

            res.status(201).json({
                success: true,
                data: result.attendance,
                projectCoordinates: attendanceService.getProjectCoordinates(result.attendance),
                message: 'Check-in realizado com sucesso.'
            });
            emitLiveTrackingUpdate(result.attendance?.company_id || result.attendance?.UserServiceProject?.service_project?.Project?.company_id, {
                attendanceId: result.attendance?.id,
                userId: user_id,
                source: 'attendance_check_in',
            });
        } catch (error: any) {
            console.error('[AttendanceController] Error in checkInByServiceProject:', error);
            const status = this.mapErrorToStatus(error.message);
            res.status(status).json({ 
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
            });
        }
    }

    async checkInPendingServiceSelection(req: Request, res: Response): Promise<void> {
        try {
            const { user_id, project_id, address, latitude, longitude } = req.body;

            if (!user_id || !project_id) {
                res.status(400).json({ error: 'user_id and project_id are required.' });
                return;
            }

            const result = await attendanceService.processPendingCheckIn({
                user_id,
                project_id,
                address,
                latitude,
                longitude
            });

            if (result.alreadyOpen) {
                res.status(400).json({
                    error: 'There is already an open attendance for this user.',
                    attendance_id: result.attendance.id
                });
                return;
            }

            res.status(201).json({
                success: true,
                data: formatActiveAttendance(result.attendance),
                projectCoordinates: attendanceService.getProjectCoordinates(result.attendance),
                message: 'Pending attendance created successfully.'
            });
            emitLiveTrackingUpdate(result.attendance?.company_id, {
                attendanceId: result.attendance?.id,
                userId: user_id,
                source: 'attendance_pending_check_in',
            });
        } catch (error: any) {
            console.error('[AttendanceController] Error in checkInPendingServiceSelection:', error);
            const status = this.mapErrorToStatus(error.message);
            res.status(status).json({
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    // Check-out consolidado
    async checkOut(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { address, latitude, longitude } = req.body;

            const updatedAttendance = await attendanceService.processCheckOut({
                attendance_id: id,
                address,
                latitude,
                longitude
            });

            emitLiveTrackingUpdate(updatedAttendance?.company_id, {
                attendanceId: updatedAttendance?.id,
                userId: updatedAttendance?.user_id,
                source: 'attendance_check_out',
            });
            res.status(200).json(updatedAttendance);
        } catch (error: any) {
            console.error('[AttendanceController] Error in checkOut:', error);
            const status = this.mapErrorToStatus(error.message);
            res.status(status).json({ error: error.message });
        }
    }

    // Listar todos os registros de um usuário
    async getAllByUser(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = req.params;
            const attendances = await prisma.userAttendance.findMany({
                where: { user_id: userId },
                include: {
                    user: { select: { id: true, name: true, manualBreakEnabled: true } },
                },
            });
            res.status(200).json(attendances);
        } catch (error) {
            res.status(500).json({ error: 'Error while fetching user attendances.' });
        }
    }

    // Listar registros ativos de um usuário
    async getActiveAttendancesByUser(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = req.params;

            const activeAttendances = await prisma.userAttendance.findMany({
                where: {
                    user_id: userId,
                    check_out_time: null,
                },
                include: {
                    user: { select: { id: true, name: true, manualBreakEnabled: true } },
                    breakRecords: {
                        orderBy: { startedAt: 'asc' }
                    },
                    UserServiceProject: {
                        include: {
                            service_project: {
                                include: {
                                    Project: {
                                        select: {
                                            id: true,
                                            radius: true
                                        }
                                    }
                                }
                            },
                        },
                    },
                },
            });

            const formatted = activeAttendances.map(formatActiveAttendance);

            res.status(200).json(formatted);
        } catch (error) {
            res.status(500).json({ error: "Error while fetching active user attendances." });
        }
    }

    // Listar histórico por usuário e serviço
    async getAttendanceByUserAndService(req: Request, res: Response) {
        const { userId, serviceProjectId } = req.query;

        if (!userId || !serviceProjectId) {
            return res.status(400).json({ error: "UserId and ServiceProjectId are required." });
        }

        try {
            const records = await prisma.userAttendance.findMany({
                where: {
                    UserServiceProject: {
                        user_id: userId as string,
                        service_project_id: serviceProjectId as string,
                    },
                },
                orderBy: { check_in_time: 'desc' }
            });

            const formatted = records.map((record) => {
                const hoursWorked = record.check_out_time
                    ? Math.abs(new Date(record.check_out_time).getTime() - new Date(record.check_in_time).getTime()) / 36e5
                    : 0;

                return {
                    id: record.id,
                    date: new Intl.DateTimeFormat("pt-BR").format(new Date(record.date)),
                    enter: new Date(record.check_in_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                    exit: record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "N/A",
                    hours: `${hoursWorked.toFixed(1)} hrs`,
                };
            });

            return res.status(200).json(formatted);
        } catch (error) {
            return res.status(500).json({ error: "Internal server error." });
        }
    }

    // Salvar lote de timeline
    async saveTimelineBatch(req: Request, res: Response): Promise<void> {
        try {
            const { userId, userServiceProjectId, locations } = req.body;
            if (!userId || !userServiceProjectId || !locations) {
                res.status(400).json({ error: 'Missing required fields' });
                return;
            }

            await attendanceService.saveTimelineBatch(userId, userServiceProjectId, locations);
            res.status(201).json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Error saving timeline batch' });
        }
    }

    // Resumo de tempo dentro/fora
    async getAttendanceSummary(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const summary = await attendanceService.getAttendanceTimelineSummary(id);
            res.status(200).json(summary);
        } catch (error: any) {
            const status = this.mapErrorToStatus(error.message);
            res.status(status).json({ error: error.message });
        }
    }

    // Atualizar horários de um registro
    async updateAttendanceTimes(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { check_in_time, check_out_time } = req.body;

            const checkInDate = new Date(check_in_time);
            const checkOutDate = check_out_time ? new Date(check_out_time) : null;

            if (checkOutDate && checkInDate > checkOutDate) {
                res.status(400).json({ error: 'Check-in time cannot be later than check-out time.' });
                return;
            }

            const updated = await prisma.userAttendance.update({
                where: { id },
                data: { check_in_time: checkInDate, check_out_time: checkOutDate },
            });

            res.status(200).json(updated);
        } catch (error) {
            res.status(500).json({ error: 'Error while updating attendance times.' });
        }
    }

    // Mudar projeto de um registro de presença
    async changeProject(req: Request, res: Response) {
        try {
            const { attendanceId } = req.params;
            const { newServiceProjectId } = req.body;

            if (!attendanceId || !newServiceProjectId) {
                return res.status(400).json({ error: 'Attendance record ID and new project ID are required' });
            }

            const attendance = await prisma.userAttendance.findUnique({ where: { id: attendanceId } });
            if (!attendance) return res.status(404).json({ error: 'Attendance record not found' });

            let userServiceProject = await prisma.userServiceProject.findFirst({
                where: { user_id: attendance.user_id, service_project_id: newServiceProjectId }
            });

            if (!userServiceProject) {
                userServiceProject = await prisma.userServiceProject.create({
                    data: { user_id: attendance.user_id, service_project_id: newServiceProjectId }
                });
            }

            const updated = await prisma.userAttendance.update({
                where: { id: attendanceId },
                data: {
                    user_service_project_id: userServiceProject.id,
                    service_selection_status: 'selected',
                    pending_project_id: null,
                    pending_project_name: null,
                    pending_project_address: null,
                    pending_project_latitude: null,
                    pending_project_longitude: null,
                    pending_project_radius: null,
                },
                include: {
                    user: { select: { id: true, name: true } },
                    UserServiceProject: {
                        include: {
                            service_project: {
                                include: {
                                    Project: {
                                        select: {
                                            id: true,
                                            radius: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            return res.status(200).json({ message: 'Project changed successfully', attendance: formatActiveAttendance(updated) });
        } catch (error) {
            return res.status(500).json({ error: 'Error processing request' });
        }
    }

    async selectServiceForAttendance(req: Request, res: Response) {
        try {
            const { attendanceId } = req.params;
            const { serviceProjectId } = req.body;

            if (!attendanceId || !serviceProjectId) {
                return res.status(400).json({ error: 'Attendance ID and serviceProjectId are required.' });
            }

            const updatedAttendance = await attendanceService.assignServiceToAttendance(attendanceId, serviceProjectId);

            return res.status(200).json({
                success: true,
                data: formatActiveAttendance(updatedAttendance),
                projectCoordinates: attendanceService.getProjectCoordinates(updatedAttendance),
                message: 'Service selected successfully.'
            });
        } catch (error: any) {
            console.error('[AttendanceController] Error in selectServiceForAttendance:', error);
            const status = this.mapErrorToStatus(error.message);
            return res.status(status).json({ error: error.message });
        }
    }

    async startBreak(req: Request, res: Response) {
        try {
            const { attendanceId } = req.params;
            const userId = (req as any).userId || (req as any).user?.id || req.body?.userId;

            if (!attendanceId) {
                return res.status(400).json({ error: 'Attendance ID is required.' });
            }

            const breakRecord = await attendanceService.startBreak(attendanceId, userId);
            return res.status(201).json({ success: true, data: breakRecord });
        } catch (error: any) {
            console.error('[AttendanceController] Error in startBreak:', error);
            const status = this.mapErrorToStatus(error.message);
            return res.status(status).json({ error: error.message });
        }
    }

    async endBreak(req: Request, res: Response) {
        try {
            const { attendanceId } = req.params;
            const userId = (req as any).userId || (req as any).user?.id || req.body?.userId;

            if (!attendanceId) {
                return res.status(400).json({ error: 'Attendance ID is required.' });
            }

            const breakRecord = await attendanceService.endBreak(attendanceId, userId);
            return res.status(200).json({ success: true, data: breakRecord });
        } catch (error: any) {
            console.error('[AttendanceController] Error in endBreak:', error);
            const status = this.mapErrorToStatus(error.message);
            return res.status(status).json({ error: error.message });
        }
    }

    // Clock In/Out unificado
    async clockInOut(req: Request, res: Response) {
        try {
            const { userId, serviceProjectId, checkInTime, checkOutTime, date } = req.body;
            if (!userId || !serviceProjectId || !date) return res.status(400).json({ error: "Required data not provided" });

            if (!checkInTime && checkOutTime) {
                // Modo Check-out
                const active = await prisma.userAttendance.findFirst({
                    where: { user_id: userId, UserServiceProject: { service_project_id: serviceProjectId }, check_out_time: null },
                    orderBy: { check_in_time: 'desc' }
                });

                if (!active) return res.status(404).json({ error: "No active record found" });

                const updated = await prisma.userAttendance.update({
                    where: { id: active.id },
                    data: { check_out_time: new Date(checkOutTime) }
                });
                return res.status(200).json({ success: true, data: updated });
            } else {
                // Modo Check-in (ou ambos)
                const result = await attendanceService.processCheckIn({
                    user_id: userId,
                    service_project_id: serviceProjectId,
                    check_in_time: checkInTime,
                    date: date
                });
                
                if (checkOutTime) {
                    await prisma.userAttendance.update({
                        where: { id: result.attendance.id },
                        data: { check_out_time: new Date(checkOutTime) }
                    });
                }

                return res.status(201).json({ success: true, data: result.attendance });
            }
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Listar projetos disponíveis para check-in
    async getAvailableProjectsForCheckIn(req: Request, res: Response): Promise<void> {
        try {
            const { userId, companyId, search } = req.query;
            if (!userId) { res.status(400).json({ error: 'User ID is required.' }); return; }

            const user = await prisma.user.findUnique({
                where: { id: userId as string },
                include: { companies: true, company: true }
            });

            if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

            const visibilityMode = user.projectVisibilityMode || user.company?.projectVisibilityMode || 'allActive';

            const userCompanyIds = [user.company_id, ...user.companies.map(c => c.companyId)].filter(Boolean) as string[];
            const finalCompanyIds = companyId ? [companyId as string].filter(id => userCompanyIds.includes(id)) : userCompanyIds;

            const serviceProjects = await prisma.serviceProject.findMany({
                where: {
                    OR: [{ status: { not: "Canceled" } }, { status: null }],
                    Project: {
                        status_project: { in: ["In Progress", "Final walkthrough", "Pre-Start"] },
                        company_id: { in: finalCompanyIds }
                    },
                    // Se o modo for 'assignedOnly', filtra apenas onde o usuário está atribuído
                    ...(visibilityMode === 'assignedOnly' ? {
                        UserServiceProject: {
                            some: {
                                user_id: userId as string
                            }
                        }
                    } : {}),
                    ...(search && { name: { contains: (search as string).toLowerCase() } })
                },
                include: {
                    Project: { include: { client: true } },
                    UserServiceProject: { where: { user_id: userId as string }, take: 1 }
                },
                orderBy: { date_creation: 'desc' }
            });

            const formatted = await Promise.all(serviceProjects.map(async (sp) => {
                let coverPhotoUrl = null;
                if (sp.Project?.cover_photo) coverPhotoUrl = await getPresignedUrl(sp.Project.cover_photo);

                return {
                    id: sp.id,
                    name: sp.name,
                    status: sp.status,
                    project: {
                        id: sp.Project!.id,
                        contract_number: sp.Project!.contract_number,
                        location: sp.Project!.location || sp.Project!.client?.location || null,
                        coordinates: { lat: sp.Project!.lat, lng: sp.Project!.log, radius: sp.Project!.radius },
                        cover_photo: coverPhotoUrl,
                        client: { id: sp.Project!.client?.id || null, name: sp.Project!.client?.name || null }
                    },
                    isAssigned: sp.UserServiceProject.length > 0,
                    userServiceProjectId: sp.UserServiceProject[0]?.id || null
                };
            }));

            res.status(200).json({ services: formatted, total: formatted.length });
        } catch (error) {
            res.status(500).json({ error: 'Error while fetching available projects.' });
        }
    }

    // Métodos legados
    async checkIn(req: Request, res: Response): Promise<void> {
        req.body.service_project_id = req.body.user_service_project_id;
        return this.checkInByServiceProject(req, res);
    }

    private mapErrorToStatus(message: string): number {
        switch (message) {
            case 'USER_NOT_FOUND': return 404;
            case 'SERVICE_NOT_FOUND': return 404;
            case 'PROJECT_INACTIVE': return 400;
            case 'SERVICE_CANCELED': return 400;
            case 'NOT_ASSIGNED': return 403;
            case 'PROJECT_NOT_FOUND': return 404;
            case 'SERVICE_PROJECT_MISMATCH': return 400;
            case 'ATTENDANCE_NOT_FOUND': return 404;
            case 'ALREADY_CHECKED_OUT': return 400;
            case 'MANUAL_BREAK_DISABLED': return 403;
            case 'BREAK_ALREADY_OPEN': return 400;
            case 'BREAK_NOT_OPEN': return 400;
            default: return 500;
        }
    }
}
