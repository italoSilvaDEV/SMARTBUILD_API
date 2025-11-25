import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPresignedUrl } from '../../utils/S3/getPresignedUrl';

const prisma = new PrismaClient();

export class UserAttendanceController {
    // Check-in do usuário
    async checkIn(req: Request, res: Response): Promise<void> {
        try {
            const {
                user_id,
                user_service_project_id,
                address,
                latitude,
                longitude
            } = req.body;

            const userExists = await prisma.user.findUnique({
                where: { id: user_id },
                select: {
                    isOverTime: true,
                    company: {
                        select: {
                            id: true,
                            workStartTime: true,
                            workEndTime: true
                        }
                    }
                }
            });

            if (!userExists) {
                res.status(400).json({ error: 'User not found.' });
                return;
            }

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

            const project = serviceProjectExists.service_project.Project;
            if (project && ['Canceled', 'Declined', 'Rejected'].includes(project.status_project)) {
                res.status(400).json({
                    error: 'Cannot check in to a canceled or rejected project.',
                    project_status: project.status_project
                });
                return;
            }

            const service = serviceProjectExists.service_project;
            if (service.status === 'Canceled') {
                res.status(400).json({
                    error: 'Cannot check in to a canceled service.',
                    service_status: service.status
                });
                return;
            }

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

            const attendance = await prisma.userAttendance.create({
                data: {
                    user_id,
                    user_service_project_id,
                    check_in_time: new Date(),
                    check_in_address: address,
                    check_in_latitude: latitude,
                    check_in_longitude: longitude,
                    isOvertime: userExists.isOverTime,
                    workStartTime: userExists.isOverTime ? userExists.company?.workStartTime : null,
                    workEndTime: userExists.isOverTime ? userExists.company?.workEndTime : null
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
            console.log('formattedAttendances', formattedAttendances)
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

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: "User ID is required"
                })
            }

            const userExists = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    isOverTime: true,
                    company: {
                        select: {
                            id: true,
                            workStartTime: true,
                            workEndTime: true
                        }
                    }
                }
            });

            if (!userExists) {
                return res.status(400).json({
                    success: false,
                    message: 'User not found.'
                });
            }

            if (!serviceProjectId || !date) {
                return res.status(400).json({
                    success: false,
                    message: "Required data not provided"
                });
            }

            const serviceProject = await prisma.serviceProject.findUnique({
                where: {
                    id: serviceProjectId
                }
            });

            if (!serviceProject) {
                return res.status(400).json({
                    success: false,
                    message: "Service project not found"
                });
            }

            if (!checkInTime && !checkOutTime) {
                return res.status(400).json({
                    success: false,
                    message: "At least one time (check-in or check-out) must be provided"
                });
            }

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

                if (serviceProject.Project && ['Canceled', 'Declined', 'Rejected'].includes(serviceProject.Project.status_project)) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled or rejected project",
                        project_status: serviceProject.Project.status_project
                    });
                }

                if (serviceProject.status === 'Canceled') {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled service",
                        service_status: serviceProject.status
                    });
                }

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
                const project = userServiceProject.service_project.Project;
                if (project && ['Canceled', 'Declined', 'Rejected'].includes(project.status_project)) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled or rejected project",
                        project_status: project.status_project
                    });
                }

                const service = userServiceProject.service_project;
                if (service.status === 'Canceled') {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot check in to a canceled service",
                        service_status: service.status
                    });
                }
            }

            if (!checkInTime && checkOutTime) {
                const activeAttendance = await prisma.userAttendance.findFirst({
                    where: {
                        user_id: userId,
                        user_service_project_id: userServiceProject.id,
                        check_out_time: null,
                    },
                    orderBy: {
                        check_in_time: 'desc'
                    }
                });

                if (!activeAttendance) {
                    return res.status(404).json({
                        success: false,
                        message: "No active record found to perform check-out"
                    });
                }

                attendance = await prisma.userAttendance.update({
                    where: {
                        id: activeAttendance.id
                    },
                    data: {
                        check_out_time: new Date(checkOutTime),
                        check_out_address: project?.location || null,
                        check_out_latitude: project?.lat ? parseFloat(project.lat) : null,
                        check_out_longitude: project?.log ? parseFloat(project.log) : null,
                    }
                });
            } else {
                attendance = await prisma.userAttendance.create({
                    data: {
                        user_id: userId,
                        user_service_project_id: userServiceProject.id,
                        check_in_time: new Date(checkInTime),
                        check_out_time: checkOutTime ? new Date(checkOutTime) : null,
                        date: new Date(date),
                        check_in_address: project?.location || "",
                        check_in_latitude: project?.lat ? parseFloat(project.lat) : 0,
                        check_in_longitude: project?.log ? parseFloat(project.log) : 0,
                        check_out_address: checkOutTime ? project?.location || null : null,
                        check_out_latitude: checkOutTime ? (project?.client?.lat ? parseFloat(project.client.lat) : null) : null,
                        check_out_longitude: checkOutTime ? (project?.client?.log ? parseFloat(project.client.log) : null) : null,
                        workStartTime: userExists.isOverTime ? userExists.company?.workStartTime : null,
                        workEndTime: userExists.isOverTime ? userExists.company?.workEndTime : null,
                        isOvertime: userExists.isOverTime,
                        company_id: project?.company_id || userExists.company?.id || null,
                    }
                });
            }

            return res.status(201).json({
                success: true,
                data: attendance
            });
        } catch (error) {
            console.error("Error registering clock in/out:", error);
            return res.status(500).json({
                success: false,
                message: "Error processing request",
                error: (error as Error).message
            });
        }
    }

    /**
     * Lista TODOS os projetos/serviços em andamento disponíveis para check-in
     * Não requer que o funcionário esteja previamente atribuído
     */
    async getAvailableProjectsForCheckIn(req: Request, res: Response): Promise<void> {
        try {
            const { userId, companyId, search } = req.query;

            if (!userId) {
                res.status(400).json({ error: 'User ID is required.' });
                return;
            }

            // Verifica se o usuário existe
            const user = await prisma.user.findUnique({
                where: { id: userId as string },
                select: {
                    company_id: true,
                    companies: {
                        select: {
                            companyId: true
                        }
                    }
                }
            });

            if (!user) {
                res.status(404).json({ error: 'User not found.' });
                return;
            }

            // Monta conjunto de empresas do usuário
            const userCompanyIds = new Set<string>();
            if (user.company_id) {
                userCompanyIds.add(user.company_id);
            }
            user.companies.forEach((c) => {
                if (c.companyId) {
                    userCompanyIds.add(c.companyId);
                }
            });

            // Se companyId veio na query, valida pertença e restringe
            if (companyId) {
                if (!userCompanyIds.has(companyId as string)) {
                    res.status(403).json({ error: 'User does not belong to the requested company.' });
                    return;
                }
                userCompanyIds.clear();
                userCompanyIds.add(companyId as string);
            }

            // Sem empresa associada: retorna lista vazia para não quebrar o app
            if (userCompanyIds.size === 0) {
                res.status(200).json({
                    services: [],
                    total: 0
                });
                return;
            }

            // Busca todos os serviços de projetos em andamento
            const serviceProjects = await prisma.serviceProject.findMany({
                where: {
                    // Apenas serviços não cancelados
                    OR: [
                        { status: { not: "Canceled" } },
                        { status: null }
                    ],
                    // Apenas projetos ativos (combina todas as condições do projeto)
                    Project: {
                        // Status do projeto: apenas "In Progress" e "Final walkthrough"
                        status_project: {
                            in: ["In Progress", "Final walkthrough"]
                        },
                        // Filtra pelas empresas do usuário
                        company_id: {
                            in: Array.from(userCompanyIds)
                        }
                    },
                    // Busca por nome do serviço (opcional)
                    ...(search && {
                        name: {
                            contains: (search as string).toLowerCase()
                        }
                    })
                },
                include: {
                    Project: {
                        select: {
                            id: true,
                            contract_number: true,
                            status_project: true,
                            location: true,
                            lat: true,
                            log: true,
                            cover_photo: true,
                            client: {
                                select: {
                                    id: true,
                                    name: true,
                                    location: true
                                }
                            }
                        }
                    },
                    // Verifica se o usuário já está atribuído
                    UserServiceProject: {
                        where: {
                            user_id: userId as string
                        },
                        select: {
                            id: true,
                            assigned_at: true
                        },
                        take: 1
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            // Formata a resposta (filtra serviços sem projeto)
            const formattedServices = await Promise.all(
                serviceProjects
                    .filter((sp) => sp.Project !== null)
                    .map(async (sp) => {
                        // Processa foto de capa do projeto
                        let coverPhotoUrl = null;
                        const coverPhoto = (sp.Project as any)?.cover_photo;
                        if (coverPhoto) {
                            try {
                                coverPhotoUrl = await getPresignedUrl(coverPhoto);
                            } catch (error) {
                                console.error('Error generating presigned URL for cover photo:', error);
                            }
                        }

                        return {
                            id: sp.id,
                            name: sp.name,
                            description: sp.description,
                            status: sp.status,
                            start_date: sp.start_date,
                            deadline: sp.deadline,
                            project: {
                                id: sp.Project!.id,
                                contract_number: sp.Project!.contract_number,
                                status_project: sp.Project!.status_project,
                                location: sp.Project!.location || sp.Project!.client?.location || null,
                                coordinates: {
                                    lat: sp.Project!.lat,
                                    lng: sp.Project!.log
                                },
                                cover_photo: coverPhotoUrl,
                                client: {
                                    id: sp.Project!.client?.id || null,
                                    name: sp.Project!.client?.name || null
                                }
                            },
                            // Indica se o usuário já está atribuído
                            isAssigned: sp.UserServiceProject.length > 0,
                            userServiceProjectId: sp.UserServiceProject[0]?.id || null
                        };
                    })
            );

            res.status(200).json({
                services: formattedServices,
                total: formattedServices.length
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error while fetching available projects.' });
        }
    }

    /**
     * Check-in simplificado - aceita serviceProjectId diretamente
     * Cria automaticamente o UserServiceProject se não existir
     */
    async checkInByServiceProject(req: Request, res: Response): Promise<void> {
        try {
            const {
                user_id,
                service_project_id, // Agora aceita serviceProjectId diretamente
                address,
                latitude,
                longitude
            } = req.body;

            if (!user_id || !service_project_id) {
                res.status(400).json({ 
                    error: 'user_id and service_project_id are required.' 
                });
                return;
            }

            // Verifica se o usuário existe
            const userExists = await prisma.user.findUnique({
                where: { id: user_id },
                select: {
                    isOverTime: true,
                    company: {
                        select: {
                            id: true,
                            workStartTime: true,
                            workEndTime: true
                        }
                    }
                }
            });

            if (!userExists) {
                res.status(400).json({ error: 'User not found.' });
                return;
            }

            // Verifica se o serviço existe e está ativo
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: service_project_id },
                include: {
                    Project: true
                }
            });

            if (!serviceProject) {
                res.status(404).json({ error: 'Service project not found.' });
                return;
            }

            // Validações de status
            const project = serviceProject.Project;
            if (project && ['Canceled', 'Declined', 'Rejected'].includes(project.status_project)) {
                res.status(400).json({
                    error: 'Cannot check in to a canceled or rejected project.',
                    project_status: project.status_project
                });
                return;
            }

            if (serviceProject.status === 'Canceled') {
                res.status(400).json({
                    error: 'Cannot check in to a canceled service.',
                    service_status: serviceProject.status
                });
                return;
            }

            // Busca ou cria o UserServiceProject
            let userServiceProject = await prisma.userServiceProject.findFirst({
                where: {
                    user_id: user_id,
                    service_project_id: service_project_id
                }
            });

            if (!userServiceProject) {
                // Cria automaticamente a relação
                userServiceProject = await prisma.userServiceProject.create({
                    data: {
                        user_id: user_id,
                        service_project_id: service_project_id,
                        assigned_at: new Date()
                    }
                });

                // Atualiza o status do serviço se necessário
                if (!serviceProject.status || serviceProject.status === 'Scheduled') {
                    await prisma.serviceProject.update({
                        where: { id: service_project_id },
                        data: {
                            status: 'In Progress'
                        }
                    });
                }
            }

            // Verifica se já existe um check-in aberto para este serviço
            const openAttendance = await prisma.userAttendance.findFirst({
                where: {
                    user_id,
                    user_service_project_id: userServiceProject.id,
                    check_out_time: null,
                },
            });

            if (openAttendance) {
                res.status(400).json({
                    error: 'There is already an open attendance for this service. Please check out before creating a new one.',
                    attendance_id: openAttendance.id
                });
                return;
            }

            // Cria o registro de check-in
            const attendance = await prisma.userAttendance.create({
                data: {
                    user_id,
                    user_service_project_id: userServiceProject.id,
                    check_in_time: new Date(),
                    check_in_address: address || serviceProject.Project?.location || '',
                    check_in_latitude: latitude || (serviceProject.Project?.lat ? parseFloat(serviceProject.Project.lat) : 0),
                    check_in_longitude: longitude || (serviceProject.Project?.log ? parseFloat(serviceProject.Project.log) : 0),
                    isOvertime: userExists.isOverTime,
                    workStartTime: userExists.isOverTime ? userExists.company?.workStartTime : null,
                    workEndTime: userExists.isOverTime ? userExists.company?.workEndTime : null
                },
                include: {
                    UserServiceProject: {
                        include: {
                            service_project: {
                                select: {
                                    id: true,
                                    name: true,
                                    Project: {
                                        select: {
                                            id: true,
                                            contract_number: true,
                                            location: true,
                                            lat: true,
                                            log: true,
                                            radius: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            // Prepara coordenadas do projeto para rastreamento GPS
            const projectCoordinates = attendance.UserServiceProject?.service_project?.Project ? {
                location: attendance.UserServiceProject.service_project.Project.location || null,
                latitude: attendance.UserServiceProject.service_project.Project.lat ? Number(attendance.UserServiceProject.service_project.Project.lat) : null,
                longitude: attendance.UserServiceProject.service_project.Project.log ? Number(attendance.UserServiceProject.service_project.Project.log) : null,
                radius: attendance.UserServiceProject.service_project.Project.radius ? Number(attendance.UserServiceProject.service_project.Project.radius) : null,
                radiusInKm: attendance.UserServiceProject.service_project.Project.radius ? Number(attendance.UserServiceProject.service_project.Project.radius) / 1000 : null
            } : null;

            res.status(201).json({
                success: true,
                data: attendance,
                // Coordenadas do projeto para rastreamento GPS (mesmo formato do /time-line/by-worker)
                projectCoordinates: projectCoordinates,
                message: 'Check-in realizado com sucesso. UserServiceProject criado automaticamente.'
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error while checking in.' });
        }
    }
}
