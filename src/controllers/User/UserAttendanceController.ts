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
                include: {
                    service_project: true
                }
            },
            );
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
         
                await prisma.serviceProject.update({
                    where: { id: serviceProjectExists.service_project_id },
                    data: {
                        status: 'In Progress'
                    }
                });
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

    async getActiveAttendancesByUser(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = req.params;

            const activeAttendances = await prisma.userAttendance.findMany({
                where: {
                    user_id: userId,
                    check_out_time: null, // Filtra registros onde o check-out ainda não foi realizado
                },
                include: {
                    user: {
                        select: { id: true, name: true },
                    },
                    UserServiceProject: {
                        include: {
                            service_project: {
                                select: { name: true, id: true }, // Inclui o nome do ServiceProject
                            },
                        },
                    },
                },
            });

            // Formata o resultado para incluir o nome do ServiceProject diretamente na resposta
            const formattedAttendances = activeAttendances.map((attendance) => ({
                ...attendance,
                service_project_name:
                    attendance.UserServiceProject?.service_project?.name || null,
            }));
            console.log('formattedAttendances',formattedAttendances)
            res.status(200).json(formattedAttendances);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error while fetching active user attendances." });
        }
    }

    async getAttendanceByUserAndService(req: Request, res: Response) {
        const { userId, serviceProjectId } = req.query;
      
        if (!userId || !serviceProjectId) {
          return res.status(400).json({ error: "UserId and ServiceProjectId are required." });
        }
      
        try {
          // Busca registros de frequência vinculados ao usuário e ao serviço
          const attendanceRecords = await prisma.userAttendance.findMany({
            where: {
              UserServiceProject: {
                user_id: userId as string,
                service_project_id: serviceProjectId as string,
              },
            },
          });
      
          // Formata os registros para o formato necessário
          const formattedRecords = attendanceRecords.map((record) => {
            const checkInTime = new Date(record.check_in_time).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            });
      
            const checkOutTime = record.check_out_time
              ? new Date(record.check_out_time).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";
      
            const hoursWorked = record.check_out_time
              ? Math.abs(
                  new Date(record.check_out_time).getTime() -
                  new Date(record.check_in_time).getTime()
                ) / 36e5 // Converte milissegundos para horas
              : 0;
      
            return {
              id: record.id,
              day: new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(
                new Date(record.date)
              ),
              date: new Intl.DateTimeFormat("pt-BR").format(new Date(record.date)),
              enter: checkInTime,
              exit: checkOutTime,
              hours: `${hoursWorked.toFixed(1)} hrs`,
            };
          });
      
          return res.status(200).json(formattedRecords);
        } catch (error) {
          console.error("Error fetching attendance records:", error);
          return res.status(500).json({ error: "Internal server error." });
        }
      }

    async updateAttendanceTimes(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { check_in_time, check_out_time } = req.body;

            // Verifica se o registro existe
            const attendance = await prisma.userAttendance.findUnique({ where: { id } });
            if (!attendance) {
                res.status(404).json({ error: 'Attendance record not found.' });
                return;
            }
            
            // Valida se as datas são válidas
            const checkInDate = new Date(check_in_time);
            const checkOutDate = check_out_time ? new Date(check_out_time) : null;

            if (checkOutDate && checkInDate > checkOutDate) {
                res.status(400).json({ error: 'Check-in time cannot be later than check-out time.' });
                return;
            }

            // Atualiza os horários
            const updatedAttendance = await prisma.userAttendance.update({
                where: { id },
                data: {
                    check_in_time: checkInDate,
                    check_out_time: checkOutDate,
                },
            });

            res.status(200).json(updatedAttendance);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error while updating attendance times.' });
        }
    }

}