import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

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

            if (!openAttendance) {
                console.log('error', 'There is already an open attendance for this project. Please check out before creating a new one.')
                res.status(400).json({
                    error: 'There is already an open attendance for this project. Please check out before creating a new one.',
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
            await this.performAutoCheckOut(
                user_id,
                user_service_project_id,
                check_in_address,
                check_in_latitude,
                check_in_longitude
            );
            
            res.status(201).json(attendance);
        } catch (error) {
            console.log('error',error)
            console.error(error);
            res.status(500).json({ error: 'Error while checking in.' });
        }
    }
}