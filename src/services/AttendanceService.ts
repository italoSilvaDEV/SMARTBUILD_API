import { PrismaClient, UserAttendance, UserServiceProject } from '@prisma/client';
import { getPresignedUrl } from '../utils/S3/getPresignedUrl';

const prisma = new PrismaClient();

export interface CheckInData {
    user_id: string;
    service_project_id: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    check_in_time?: Date | string | null;
    date?: Date | string | null;
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
        const { user_id, service_project_id, address, latitude, longitude, check_in_time, date } = data;

        // Usar transação para garantir atomicidade e evitar duplicatas em chamadas simultâneas
        return await prisma.$transaction(async (tx) => {
            // 1. Validar Usuário e Configurações
            const user = await tx.user.findUnique({
                where: { id: user_id },
                select: {
                    isOverTime: true,
                    projectVisibilityMode: true,
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

            // 2. Verificar se JÁ EXISTE QUALQUER ponto aberto para este usuário
            // IMPORTANTE: Um usuário só pode ter UM ponto aberto no sistema todo, independente do projeto.
            const anyOpenAttendance = await tx.userAttendance.findFirst({
                where: {
                    user_id,
                    check_out_time: null,
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

            if (anyOpenAttendance) {
                console.log(`[AttendanceService] Usuário ${user_id} já possui ponto aberto (ID: ${anyOpenAttendance.id}). Retornando existente.`);
                return {
                    alreadyOpen: true,
                    attendance: anyOpenAttendance
                };
            }

            // 3. Validar Serviço e Projeto
            const serviceProject = await tx.serviceProject.findUnique({
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

            // 4. Gerenciar Vínculo (UserServiceProject)
            const visibilityMode = user.projectVisibilityMode || user.company?.projectVisibilityMode || 'allActive';
            let userServiceProject = await tx.userServiceProject.findFirst({
                where: {
                    user_id: user_id,
                    service_project_id: service_project_id
                }
            });

            if (!userServiceProject) {
                if (visibilityMode === 'assignedOnly') {
                    throw new Error('NOT_ASSIGNED');
                }

                userServiceProject = await tx.userServiceProject.create({
                    data: {
                        user_id: user_id,
                        service_project_id: service_project_id,
                        assigned_at: date ? new Date(date) : new Date()
                    }
                });

                if (!serviceProject.status || serviceProject.status === 'In Progress' || serviceProject.status === 'Scheduled') {
                    await tx.serviceProject.update({
                        where: { id: service_project_id },
                        data: { status: 'In Progress' }
                    });
                }
            }

            // 5. Criar Registro de Ponto
            const attendance = await tx.userAttendance.create({
                data: {
                    user_id,
                    user_service_project_id: userServiceProject.id,
                    check_in_time: check_in_time ? new Date(check_in_time) : new Date(),
                    date: date ? new Date(date) : new Date(),
                    check_in_address: address || project?.location || '',
                    check_in_latitude: Number.isFinite(latitude) ? latitude! : (project?.lat && !isNaN(parseFloat(project.lat)) ? parseFloat(project.lat) : 0),
                    check_in_longitude: Number.isFinite(longitude) ? longitude! : (project?.log && !isNaN(parseFloat(project.log)) ? parseFloat(project.log) : 0),
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
        }, {
            isolationLevel: 'Serializable',
        });
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

    /**
     * Salva um lote de localizações na timeline.
     * Otimizado para reduzir chamadas ao banco.
     */
    async saveTimelineBatch(userId: string, userServiceProjectId: string, locations: any[]) {
        if (!locations.length) return;

        return await prisma.timeLine.createMany({
            data: locations.map(loc => ({
                user_id: userId,
                userServiceProjectId: userServiceProjectId,
                check_in_time: new Date(loc.timestamp),
                check_in_latitude: loc.latitude,
                check_in_longitude: loc.longitude,
                check_in_address: loc.address || '',
                is_local_work: loc.isInside,
                service_project_id: loc.serviceProjectId
            }))
        });
    }

    /**
     * Calcula o resumo de tempo dentro/fora da obra para um atendimento.
     */
    async getAttendanceTimelineSummary(attendanceId: string) {
        const attendance = await prisma.userAttendance.findUnique({
            where: { id: attendanceId },
            include: {
                UserServiceProject: true
            }
        });

        if (!attendance) throw new Error('ATTENDANCE_NOT_FOUND');

        const startTime = attendance.check_in_time;
        const endTime = attendance.check_out_time || new Date();

        const timelines = await prisma.timeLine.findMany({
            where: {
                userServiceProjectId: attendance.user_service_project_id,
                check_in_time: {
                    gte: startTime,
                    lte: endTime
                }
            },
            orderBy: { check_in_time: 'asc' }
        });

        let insideMs = 0;
        let outsideMs = 0;

        if (timelines.length > 0) {
            for (let i = 0; i < timelines.length; i++) {
                const current = timelines[i];
                const next = timelines[i + 1] || { check_in_time: endTime };
                
                const duration = next.check_in_time.getTime() - current.check_in_time.getTime();
                
                if (current.is_local_work) {
                    insideMs += duration;
                } else {
                    outsideMs += duration;
                }
            }
        } else {
            // Se não houver pontos de timeline, assumimos o estado inicial do check-in
            // (ou simplesmente retornamos 0 se não houver dados suficientes)
        }

        return {
            totalMinutes: Math.floor((endTime.getTime() - startTime.getTime()) / 60000),
            insideMinutes: Math.floor(insideMs / 60000),
            outsideMinutes: Math.floor(outsideMs / 60000),
            timelinePoints: timelines.length
        };
    }
}
