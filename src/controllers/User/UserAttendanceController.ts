import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class UserAttendanceController {
    // Check-in do usuário
    async checkIn(req: Request, res: Response): Promise<void> {
        try {
            const { user_id, user_service_project_id, address, latitude, longitude } = req.body;

            // Verifica se o usuário existe
            const userExists = await prisma.user.findUnique({ where: { id: user_id } });
            if (!userExists) {
                res.status(400).json({ error: 'User not found.' });
                return;
            }

            // Verifica se o UserServiceProject existe
            const serviceProjectExists = await prisma.userServiceProject.findUnique({
                where: { id: user_service_project_id },
            });
            if (!serviceProjectExists) {
                res.status(400).json({ error: 'UserServiceProject not found.' });
                return;
            }

            // Verifica se já existe um registro de ponto aberto (sem check-out) para o mesmo UserServiceProject
            const openAttendance = await prisma.userAttendance.findFirst({
                where: {
                    user_id,
                    user_service_project_id,
                    check_out_time: null,
                },
            });

            if (openAttendance) {
                res.status(400).json({
                    error: 'There is already an open attendance for this project. Please check out before creating a new one.',
                });
                return;
            }

            // Cria o registro de check-in
            const attendance = await prisma.userAttendance.create({
                data: {
                    user_id,
                    user_service_project_id,
                    check_in_time: new Date(),
                    check_in_address: address,
                    check_in_latitude: latitude,
                    check_in_longitude: longitude,
                },
            });

            res.status(201).json(attendance);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error while checking in.' });
        }
    }

    // Check-out do usuário
    async checkOut(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { address, latitude, longitude } = req.body;

            // Verifica se o registro existe
            const attendance = await prisma.userAttendance.findUnique({ where: { id } });
            if (!attendance) {
                res.status(404).json({ error: 'Attendance record not found.' });
                return;
            }

            // Atualiza o check-out
            const updatedAttendance = await prisma.userAttendance.update({
                where: { id },
                data: {
                    check_out_time: new Date(),
                    check_out_address: address,
                    check_out_latitude: latitude,
                    check_out_longitude: longitude,
                },
            });

            res.status(200).json(updatedAttendance);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error while checking out.' });
        }
    }

    // Listar todos os registros de um usuário
    async getAllByUser(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = req.params;

            const attendances = await prisma.userAttendance.findMany({
                where: { user_id: userId },
                include: {
                    user: {
                        select: { id: true, name: true },
                    },
                },
            });

            res.status(200).json(attendances);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error while fetching user attendances.' });
        }
    }
   
}