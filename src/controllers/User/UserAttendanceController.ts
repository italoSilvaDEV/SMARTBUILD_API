import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';

const prisma = new PrismaClient();
const attendanceService = new AttendanceService();

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
        } catch (error: any) {
            console.error('[AttendanceController] Error in checkInByServiceProject:', error);
            const status = this.mapErrorToStatus(error.message);
            res.status(status).json({ error: error.message });
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

            res.status(200).json(updatedAttendance);
        } catch (error: any) {
            console.error('[AttendanceController] Error in checkOut:', error);
            const status = this.mapErrorToStatus(error.message);
            res.status(status).json({ error: error.message });
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
                    user: { select: { id: true, name: true } },
                    UserServiceProject: {
                        include: {
                            service_project: { select: { name: true, id: true } },
                        },
                    },
                },
            });

            const formatted = activeAttendances.map((att) => ({
                ...att,
                idServiceProject: att.UserServiceProject?.service_project?.id || null,
                service_project_name: att.UserServiceProject?.service_project?.name || null,
            }));

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

    // Métodos legados mantidos para compatibilidade (mas usando o service por baixo)
    async checkIn(req: Request, res: Response): Promise<void> {
        req.body.service_project_id = req.body.user_service_project_id; // Mapeia campo legado
        return this.checkInByServiceProject(req, res);
    }

    private mapErrorToStatus(message: string): number {
        switch (message) {
            case 'USER_NOT_FOUND': return 404;
            case 'SERVICE_NOT_FOUND': return 404;
            case 'PROJECT_INACTIVE': return 400;
            case 'SERVICE_CANCELED': return 400;
            case 'NOT_ASSIGNED': return 403;
            case 'ATTENDANCE_NOT_FOUND': return 404;
            case 'ALREADY_CHECKED_OUT': return 400;
            default: return 500;
        }
    }
}
