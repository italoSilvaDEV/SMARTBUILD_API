import { PrismaClient, UserAttendance, UserServiceProject } from '@prisma/client';
import { getPresignedUrl } from '../utils/S3/getPresignedUrl';

const prisma = new PrismaClient();

export interface CheckInData {
    user_id: string;
    service_project_id: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}

export interface CheckOutData {
    attendance_id: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}

export class AttendanceService {
    /**
     * Processa o check-in de um usuário em um serviço/projeto.
     * Centraliza validações e criação de vínculos automáticos.
     */
    async processCheckIn(data: CheckInData) {
        const { user_id, service_project_id, address, latitude, longitude } = data;

        // 1. Validar Usuário e Configurações
        const user = await prisma.user.findUnique({
            where: { id: user_id },
            select: {
                isOverTime: true,
                company: {
                    select: {
                        id: true,
                        workStartTime: true,
                        workEndTime: true,
                        projectVisibilityMode: true
                    }
                }
            }
        });

        if (!user) throw new Error('USER_NOT_FOUND');

        const visibilityMode = user.company?.projectVisibilityMode || 'allActive';

        // 2. Validar Serviço e Projeto
        const serviceProject = await prisma.serviceProject.findUnique({
            where: { id: service_project_id },
            include: { Project: true }
        });

        if (!serviceProject) throw new Error('SERVICE_NOT_FOUND');

        const project = serviceProject.Project;
        if (project && ['Canceled', 'Declined', 'Rejected'].includes(project.status_project)) {
            throw new Error('PROJECT_INACTIVE');
        }

        if (serviceProject.status === 'Canceled') {
            throw new Error('SERVICE_CANCELED');
        }

        // 3. Gerenciar Vínculo (UserServiceProject)
        let userServiceProject = await prisma.userServiceProject.findFirst({
            where: {
                user_id: user_id,
                service_project_id: service_project_id
            }
        });

        if (!userServiceProject) {
            if (visibilityMode === 'assignedOnly') {
                throw new Error('NOT_ASSIGNED');
            }

            userServiceProject = await prisma.userServiceProject.create({
                data: {
                    user_id: user_id,
                    service_project_id: service_project_id,
                    assigned_at: new Date()
                }
            });

            // Atualizar status do serviço se for o primeiro check-in
            if (!serviceProject.status || serviceProject.status === 'Scheduled') {
                await prisma.serviceProject.update({
                    where: { id: service_project_id },
                    data: { status: 'In Progress' }
                });
            }
        }

        // 4. Verificar se já existe ponto aberto
        const openAttendance = await prisma.userAttendance.findFirst({
            where: {
                user_id,
                user_service_project_id: userServiceProject.id,
                check_out_time: null,
            },
        });

        if (openAttendance) {
            return {
                alreadyOpen: true,
                attendance: openAttendance
            };
        }

        // 5. Criar Registro de Ponto
        const attendance = await prisma.userAttendance.create({
            data: {
                user_id,
                user_service_project_id: userServiceProject.id,
                check_in_time: new Date(),
                check_in_address: address || project?.location || '',
                check_in_latitude: latitude || (project?.lat ? parseFloat(project.lat) : 0),
                check_in_longitude: longitude || (project?.log ? parseFloat(project.log) : 0),
                isOvertime: user.isOverTime,
                workStartTime: user.isOverTime ? user.company?.workStartTime : null,
                workEndTime: user.isOverTime ? user.company?.workEndTime : null,
                company_id: project?.company_id || user.company?.id || null
            },
            include: {
                UserServiceProject: {
                    include: {
                        service_project: {
                            include: { Project: true }
                        }
                    }
                }
            }
        });

        return {
            alreadyOpen: false,
            attendance
        };
    }

    /**
     * Processa o check-out de um registro de ponto.
     */
    async processCheckOut(data: CheckOutData) {
        const { attendance_id, address, latitude, longitude } = data;

        const attendance = await prisma.userAttendance.findUnique({
            where: { id: attendance_id }
        });

        if (!attendance) throw new Error('ATTENDANCE_NOT_FOUND');
        if (attendance.check_out_time) throw new Error('ALREADY_CHECKED_OUT');

        return await prisma.userAttendance.update({
            where: { id: attendance_id },
            data: {
                check_out_time: new Date(),
                check_out_address: address,
                check_out_latitude: latitude,
                check_out_longitude: longitude,
            },
        });
    }

    /**
     * Prepara as coordenadas do projeto para o App (Geofencing).
     */
    getProjectCoordinates(attendance: any) {
        const project = attendance.UserServiceProject?.service_project?.Project;
        if (!project) return null;

        return {
            location: project.location || null,
            latitude: project.lat ? Number(project.lat) : null,
            longitude: project.log ? Number(project.log) : null,
            radius: project.radius ? Number(project.radius) : null,
            radiusInKm: project.radius ? Number(project.radius) / 1000 : null
        };
    }
}
