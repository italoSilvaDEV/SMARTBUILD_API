import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPresignedUrl } from '../../utils/S3/getPresignedUrl';
import { AuditController } from '../Audit/AuditController';
import { logAudit } from '../../utils/auditLogger';
import { returnPayLoad } from '../../config/returnPayLoad';

const prisma = new PrismaClient();

export class TimeLineController {
    // Função para calcular distância entre coordenadas usando Haversine
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Raio da Terra em km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distância em km
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI/180);
    }

    private async performAutoCheckOut(
        user_id: string,
        user_service_project_id: string,
        check_in_address: string,
        check_in_latitude: number,
        check_in_longitude: number
    ) {
        /* Código de auto check-out às 18h comentado
        const now = new Date();
        if (now.getHours() >= 18) {
            // Busca o registro de attendance aberto
            const openAttendance = await prisma.userAttendance.findFirst({
                where: {
                    user_id,
                    user_service_project_id,
                    check_out_time: null,
                },
            });

            if (openAttendance) {
                // Realiza o check-out automático
                await prisma.userAttendance.update({
                    where: { id: openAttendance.id },
                    data: {
                        check_out_time: now,
                        check_out_address: check_in_address, // Usa o mesmo endereço do check-in
                        check_out_latitude: check_in_latitude,
                        check_out_longitude: check_in_longitude,
                    },
                });
            }
        }
        */
    }

    // Check-in do usuário
    handleTimeLine = async (req: Request, res: Response): Promise<void> => {
        try {
            const { 
                user_id,
                user_service_project_id,
                check_in_address,
                check_in_latitude,
                check_in_longitude,
                service_project_id,
            } = req.body;
            // Verifica se o usuário existe
            const userExists = await prisma.user.findUnique({ where: { id: user_id } });
            if (!userExists) {
                console.log('error', 'User not found.')
                res.status(400).json({ error: 'User not found.' });
                return;
            }

            // Verifica se o ServiceProject existe e obtém suas coordenadas
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: service_project_id },
                include: {
                    Project: {
                        include: {
                            client: true
                        }
                    }
                }
            });

            if (!serviceProject) {
                console.log('error', 'ServiceProject not found.')
                res.status(400).json({ error: 'ServiceProject not found.' });
                return;
            }

            // Verifica se o UserServiceProject existe
            const serviceProjectExists = await prisma.userServiceProject.findUnique({
                where: { id: user_service_project_id },
                include: {
                    service_project: true
                }
            });

            if (!serviceProjectExists) {
                console.log('error', 'UserServiceProject not found.')
                res.status(400).json({ error: 'UserServiceProject not found.' });
                return;
            }

            // Verifica se já existe um registro aberto
            const openAttendance = await prisma.userAttendance.findFirst({
                where: {
                    user_id,
                    user_service_project_id,
                    check_out_time: null,
                },
            });

            if (openAttendance) {
                // Continua com o processamento normal
            } else {
                res.status(400).json({
                    error: 'No open attendance found. Please check in first.',
                });
                return;
            }

            let isLocalWork = false;

            // Verifica se as coordenadas foram fornecidas
            if (check_in_latitude && check_in_longitude && 
                serviceProject.Project?.client?.lat && 
                serviceProject.Project?.client?.log && 
                serviceProject.Project?.client?.radius) {
                
                // Calcula a distância entre os pontos
                const distance = this.calculateDistance(
                    Number(check_in_latitude),
                    Number(check_in_longitude),
                    Number(serviceProject.Project.client.lat),
                    Number(serviceProject.Project.client.log)
                );

                // Verifica se está dentro do raio (convertendo o raio para km)
                const radiusInKm = Number(serviceProject.Project.client.radius) / 1000;
                isLocalWork = distance <= radiusInKm;
            }

            // Cria o registro de check-in
            const attendance = await prisma.timeLine.create({
                data: {
                    user_id,
                    service_project_id,
                    userServiceProjectId: user_service_project_id,
                    check_in_time: new Date(),
                    check_in_address,
                    check_in_latitude,
                    check_in_longitude,
                    is_local_work: isLocalWork,
                },
            });

            // Verifica e realiza check-out automático se for 18:00 ou mais
            /* Chamada ao auto check-out às 18h comentada
            await this.performAutoCheckOut(
                user_id,
                user_service_project_id,
                check_in_address,
                check_in_latitude,
                check_in_longitude
            );
            */
            
            res.status(201).json(attendance);
        } catch (error) {
            console.log('error',error)
            console.error(error);
            res.status(500).json({ error: 'Error while checking in.' });
        }
    }


    // Check-in do usuário
    handleTimeLineClient = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                user_id,
                user_service_project_id,
                check_in_address,
                check_in_latitude,
                check_in_longitude,
                service_project_id,
                is_local_work
            } = req.body;
            // Verifica se o usuário existe
            const userExists = await prisma.user.findUnique({ where: { id: user_id } });
            if (!userExists) {
                console.log('error', 'User not found.')
                res.status(400).json({ error: 'User not found.' });
                return;
            }

            // Verifica se o ServiceProject existe e obtém suas coordenadas
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: service_project_id },
                include: {
                    Project: {
                        include: {
                            client: true
                        }
                    }
                }
            });

            if (!serviceProject) {
                console.log('error', 'ServiceProject not found.')
                res.status(400).json({ error: 'ServiceProject not found.' });
                return;
            }

            // Verifica se o UserServiceProject existe
            const serviceProjectExists = await prisma.userServiceProject.findUnique({
                where: { id: user_service_project_id },
                include: {
                    service_project: true
                }
            });

            if (!serviceProjectExists) {
                console.log('error', 'UserServiceProject not found.')
                res.status(400).json({ error: 'UserServiceProject not found.' });
                return;
            }

            // Verifica se já existe um registro aberto
            const openAttendance = await prisma.userAttendance.findFirst({
                where: {
                    user_id,
                    user_service_project_id,
                    check_out_time: null,
                },
            });

            if (openAttendance) {
                // Continua com o processamento normal
            } else {
                res.status(400).json({
                    error: 'No open attendance found. Please check in first.',
                });
                return;
            }

            if (!service_project_id) {
                console.log('error', 'service_project_id is required');
                res.status(400).json({ error: 'service_project_id is required.' });
                return;
            }

            // Cria o registro de check-in
            const attendance = await prisma.timeLine.create({
                data: {
                    user_id,
                    service_project_id,
                    userServiceProjectId: user_service_project_id,
                    check_in_time: new Date(),
                    check_in_address,
                    check_in_latitude,
                    check_in_longitude,
                    is_local_work,
                },
            });

            // Verifica e realiza check-out automático se for 18:00 ou mais
            /* Chamada ao auto check-out às 18h comentada
            await this.performAutoCheckOut(
                user_id,
                user_service_project_id,
                check_in_address,
                check_in_latitude,
                check_in_longitude
            );
            */

            res.status(201).json(attendance);
        } catch (error) {
            console.log('error', error)
            console.error(error);
            res.status(500).json({ error: 'Error while checking in.' });
        }
    }

    // Atualização do método para buscar timeline por worker
    async handleTimeLineByWorker(req: Request, res: Response) {
        try {
            const { user_service_project_id, date } = req.params;
            
            if (!user_service_project_id) {
                return res.status(400).json({ error: "user_service_project_id is required" });
            }
            
            // Buscar o UserServiceProject para verificar se existe
            const userServiceProject = await prisma.userServiceProject.findFirst({
                where: {
                    id: String(user_service_project_id)
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            avatar: true
                        }
                    },
                    service_project: true
                }
            });
            
            if (!userServiceProject) {
                console.log(user_service_project_id, 'UserServiceProject not found')
                return res.status(404).json({ error: "UserServiceProject not found" });
            }
            
            // Gerar URL assinada para o avatar do usuário, se existir
            let userWithPresignedAvatar = { ...userServiceProject.user };
            if (userServiceProject.user?.avatar) {
                userWithPresignedAvatar.avatar = await getPresignedUrl(userServiceProject.user.avatar);
            }
            
            // Preparar filtro de data se fornecido
            let dateFilter = {};
            if (date) {
                const selectedDate = new Date(date as string);
                const nextDay = new Date(selectedDate);
                nextDay.setDate(nextDay.getDate() + 1);
                
                dateFilter = {
                    check_in_time: {
                        gte: selectedDate,
                        lt: nextDay
                    }
                };
            }
            
            // Buscar todas as timelines associadas a este UserServiceProject com filtro de data opcional
            const timelines = await prisma.timeLine.findMany({
                where: {
                    userServiceProjectId: String(user_service_project_id),
                    ...dateFilter
                },
                orderBy: {
                    check_in_time: 'desc'
                }
            });
            
            return res.status(200).json({
                userServiceProject: {
                    ...userServiceProject,
                    user: userWithPresignedAvatar
                },
                timelines,
                dateFilter: date ? new Date(date as string).toISOString().split('T')[0] : null
            });
        } catch (error) {
            console.error("Error fetching timeline by worker:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
    // Delete timeline record
    deleteTimeline = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = returnPayLoad(req);
            if(!user){
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { id } = req.params;
            
            // Verify if the timeline exists
            const timeline = await prisma.userAttendance.findUnique({
                where: { id },
                include: {
                    user: true,
                    UserServiceProject: {
                        include: {
                            service_project: true
                        }
                    }
                }
            });
            
            if (!timeline) {
                res.status(404).json({ error: 'Timeline record not found.' });
                return;
            }            
          
           
            const clockInTime = timeline?.check_in_time ? new Date(timeline.check_in_time).toLocaleString() : 'N/A';
            const clockOutTime = timeline?.check_out_time ? new Date(timeline.check_out_time).toLocaleString() : 'N/A';
            
            const auditMessage = `Delete clock-in/clock-out record ${timeline.id} for user ${timeline.user.name} (${timeline.user.id}) on service project ${timeline.UserServiceProject.service_project.name || 'Unnamed project'} (${timeline.UserServiceProject.service_project.id}). Clock-in: ${clockInTime}, Clock-out: ${clockOutTime}`;
            logAudit(auditMessage, user.id);
            await prisma.userAttendance.delete({
                where: { id }
            });
            res.status(200).json({ message: 'Timeline record deleted successfully.' });
        } catch (error) {
            console.error('Error deleting timeline:', error);
            res.status(500).json({ error: 'Error while deleting timeline record.' });
        }
    }
}