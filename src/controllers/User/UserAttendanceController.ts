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

            // Verifica se o UserServiceProject existe e inclui validações críticas
            const serviceProjectExists = await prisma.userServiceProject.findUnique({
                where: { id: user_service_project_id },
                include: {
                    service_project: {
                        include: {
                            Project: true
                        }
                    }
                }
            });
            
            if (!serviceProjectExists) {
                res.status(400).json({ error: 'UserServiceProject not found.' });
                return;
            }

            // VALIDAÇÕES CRÍTICAS PARA EVITAR BUG DO "LIMBO"
            
            // 1. Verificar se o projeto não está cancelado
            const project = serviceProjectExists.service_project.Project;
            if (project && ['Canceled', 'Declined', 'Rejected'].includes(project.status_project)) {
                res.status(400).json({ 
                    error: 'Cannot check in to a canceled or rejected project.',
                    project_status: project.status_project
                });
                return;
            }

            // 2. Verificar se o serviço não está cancelado
            const service = serviceProjectExists.service_project;
            if (service.status === 'Canceled') {
                res.status(400).json({ 
                    error: 'Cannot check in to a canceled service.',
                    service_status: service.status
                });
                return;
            }

            // 3. Verificar se o usuário realmente está vinculado a este serviço
            const validUserService = await prisma.userServiceProject.findFirst({
                where: {
                    id: user_service_project_id,
                    user_id: user_id,
                    service_project: {
                        OR: [
                            { status: { not: "Canceled" } },
                            { status: null }
                        ],
                        Project: {
                            status_project: {
                                notIn: ["Canceled", "Declined", "Rejected"]
                            }
                        }
                    }
                }
            });

            if (!validUserService) {
                res.status(400).json({ 
                    error: 'User is not authorized to check in to this service or the service/project is not active.'
                });
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
                idServiceProject: attendance.UserServiceProject?.service_project?.id || null,         
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

    async changeProject(req: Request, res: Response) { 
        try {
            const { attendanceId } = req.params;
            const { newServiceProjectId } = req.body;
            
            if (!attendanceId || !newServiceProjectId) {
                return res.status(400).json({ error: 'Attendance record ID and new project ID are required' });
            }
            
            // Buscar o registro de presença no banco de dados
            const attendance = await prisma.userAttendance.findUnique({ 
                where: { id: attendanceId },
                include: { user: true }
            });
            
            if (!attendance) {
                return res.status(404).json({ error: 'Attendance record not found' });
            }
            
            // Verificar se o novo projeto existe
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: newServiceProjectId }
            });
            
            if (!serviceProject) {
                return res.status(404).json({ error: 'Project not found. Please verify if the project ID is valid.' });
            }
            
            // Buscar ou criar uma relação UserServiceProject
            let userServiceProject = await prisma.userServiceProject.findFirst({
                where: {
                    user_id: attendance.user_id,
                    service_project_id: newServiceProjectId
                }
            });
            
            // Se não existir, criar a relação
            if (!userServiceProject) {
                userServiceProject = await prisma.userServiceProject.create({
                    data: {
                        user_id: attendance.user_id,
                        service_project_id: newServiceProjectId
                    }
                });
            }
            
            // Atualizar o projeto usando o ID do UserServiceProject
            const updatedAttendance = await prisma.userAttendance.update({
                where: { id: attendanceId },
                data: {
                    user_service_project_id: userServiceProject.id
                },
                include: {
                    user: {
                        select: { id: true, name: true }
                    },
                    UserServiceProject: {
                        include: {
                            service_project: {
                                select: { id: true, name: true }
                            }
                        }
                    }
                }
            });
            
            return res.status(200).json({
                message: 'Project changed successfully',
                attendance: updatedAttendance
            });
        } catch (error) {
            console.error('Error changing project:', error);
            return res.status(500).json({ error: 'Error processing request' });
        }
    }

    async clockInOut(req: Request, res: Response) {
        try {
            const { 
                userId, 
                serviceProjectId, 
                checkInTime, 
                checkOutTime, 
                date
            } = req.body;

            // Validar dados obrigatórios
            if (!userId || !serviceProjectId || !date) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Dados obrigatórios não fornecidos" 
                });
            }

            // Validar se pelo menos um dos horários foi fornecido
            if (!checkInTime && !checkOutTime) {
                return res.status(400).json({
                    success: false,
                    message: "É necessário fornecer pelo menos um horário (entrada ou saída)"
                });
            }

            // Criar um novo registro de atendimento ou buscar existente para o mesmo dia
            let attendance;
            const project = await prisma.project.findFirst({
                where: {
                    serviceProject: {
                        some: {
                            id: serviceProjectId
                        }
                    }
                },
                include: {
                    client: true
                }
            });
            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: "Project not found"
                });
            }

            // Verificar se existe um UserServiceProject válido ou criar um novo
            let userServiceProject = await prisma.userServiceProject.findFirst({
                where: {
                    user_id: userId,
                    service_project_id: serviceProjectId
                },
                include: {
                    service_project: {
                        include: {
                            Project: true
                        }
                    }
                }
            });

            if (!userServiceProject) {
                // VALIDAÇÕES ANTES DE CRIAR NOVO UserServiceProject
                
                // Verificar se o serviço existe e está ativo
                const serviceProject = await prisma.serviceProject.findUnique({
                    where: { id: serviceProjectId },
                    include: {
                        Project: true
                    }
                });

                if (!serviceProject) {
                    return res.status(404).json({
                        success: false,
                        message: "Service project not found"
                    });
                }

                // Verificar se o projeto não está cancelado
                if (serviceProject.Project && ['Canceled', 'Declined', 'Rejected'].includes(serviceProject.Project.status_project)) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled or rejected project",
                        project_status: serviceProject.Project.status_project
                    });
                }

                // Verificar se o serviço não está cancelado
                if (serviceProject.status === 'Canceled') {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled service",
                        service_status: serviceProject.status
                    });
                }

                // Se não existir, criar um novo UserServiceProject
                userServiceProject = await prisma.userServiceProject.create({
                    data: {
                        user_id: userId,
                        service_project_id: serviceProjectId
                    },
                    include: {
                        service_project: {
                            include: {
                                Project: true
                            }
                        }
                    }
                });
            } else {
                // VALIDAÇÕES PARA UserServiceProject EXISTENTE
                
                // Verificar se o projeto não está cancelado
                const project = userServiceProject.service_project.Project;
                if (project && ['Canceled', 'Declined', 'Rejected'].includes(project.status_project)) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled or rejected project",
                        project_status: project.status_project
                    });
                }

                // Verificar se o serviço não está cancelado
                const service = userServiceProject.service_project;
                if (service.status === 'Canceled') {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled service",
                        service_status: service.status
                    });
                }
            }

            // Caso apenas tenha o checkOutTime, precisamos encontrar um registro ativo para fazer checkout
            if (!checkInTime && checkOutTime) {
                // Buscar registro ativo para fazer checkout
                const activeAttendance = await prisma.userAttendance.findFirst({
                    where: {
                        user_id: userId,
                        user_service_project_id: userServiceProject.id,  // Usar o ID do userServiceProject
                        check_out_time: null,
                        // Opcional: verificar se a data do checkin corresponde a data informada
                    },
                    orderBy: {
                        check_in_time: 'desc'
                    }
                });

                if (!activeAttendance) {
                    return res.status(404).json({
                        success: false,
                        message: "Não foi encontrado um registro ativo para realizar o check-out"
                    });
                }

                // Atualizar o registro existente com o horário de saída
                attendance = await prisma.userAttendance.update({
                    where: {
                        id: activeAttendance.id
                    },
                    data: {
                        check_out_time: new Date(checkOutTime),
                        check_out_address: project?.client?.location || null,
                        check_out_latitude: project?.client?.lat ? parseFloat(project.client.lat) : null,
                        check_out_longitude: project?.client?.log ? parseFloat(project.client.log) : null
                    }
                });
            } else {
                // Criar um novo registro com check-in
                attendance = await prisma.userAttendance.create({
                    data: {
                        user_id: userId,
                        user_service_project_id: userServiceProject.id,  // Usar o ID do userServiceProject
                        check_in_time: new Date(checkInTime),
                        check_out_time: checkOutTime ? new Date(checkOutTime) : null,
                        date: new Date(date),
                        check_in_address: project?.client?.location || "",
                        check_in_latitude: project?.client?.lat ? parseFloat(project.client.lat) : 0,
                        check_in_longitude: project?.client?.log ? parseFloat(project.client.log) : 0,
                        check_out_address: checkOutTime ? project?.client?.location || null : null,
                        check_out_latitude: checkOutTime ? (project?.client?.lat ? parseFloat(project.client.lat) : null) : null,
                        check_out_longitude: checkOutTime ? (project?.client?.log ? parseFloat(project.client.log) : null) : null
                    }
                });
            }

            return res.status(201).json({
                success: true,
                data: attendance
            });
        } catch (error) {
            console.error("Erro ao registrar clock in/out:", error);
            return res.status(500).json({
                success: false,
                message: "Erro ao processar a solicitação",
                error: (error as Error).message
            });
        }
    }
}