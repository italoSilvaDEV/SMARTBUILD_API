import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { sendEmail } from "../../utils/sendEmail";

interface User {
    id: string
}

interface Subcontractor {
    id: string
}

interface CreateJobProject {
    projectId: string
    companyId: string
    serviceProjectId: string
    users?: User[]
    subcontractors?: Subcontractor[]
    startDate: string
    deadline: string
    skipEmail?: boolean
    description?: string
}

export class CreateJobProjectController {
    async handle(req: Request, res: Response) {
        const body = req.body as CreateJobProject

        try {
            if (!body.projectId
                || !body.companyId
                || !body.serviceProjectId
                || !body.startDate
                || !body.deadline
            ) {
                return res.status(400).json({
                    error: "Project ID, company ID, service project ID, start date and deadline are required"
                })
            }

            if (!body.users && !body.subcontractors) {
                return res.status(400).json({
                    error: "Users or subcontractors are required"
                })
            }

            const company = await prisma.company.findUnique({
                where: {
                    id: body.companyId
                },
                select: {
                    id: true,
                    name: true,
                }
            })

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                })
            }

            const project = await prisma.project.findUnique({
                where: {
                    id: body.projectId,
                    company_id: company.id
                },
                select: {
                    id: true,
                }
            })

            if (!project) {
                return res.status(404).json({
                    error: "Project not found"
                })
            }

            const serviceProject = await prisma.serviceProject.findUnique({
                where: {
                    id: body.serviceProjectId,
                    projectId: project.id
                },
                select: {
                    id: true,
                    start_date: true,
                    deadline: true,
                }
            })

            if (!serviceProject) {
                return res.status(404).json({
                    error: "Service project not found"
                })
            }

            const isScheduleChange = !!(serviceProject.start_date && serviceProject.deadline);
            const oldStartDate = serviceProject.start_date;
            const oldDeadline = serviceProject.deadline;

            if (body.users) {
                for (const user of body.users) {
                    const userExists = await prisma.user.findUnique({
                        where: {
                            id: user.id,
                            isDisabled: false,
                            companies: {
                                some: {
                                    companyId: company.id,
                                    office: {
                                        name: "Worker"
                                    }
                                }
                            }
                        }
                    })

                    if (!userExists) {
                        return res.status(404).json({
                            error: "User not found"
                        })
                    }

                    const userServiceProjectExists = await prisma.userServiceProject.findUnique({
                        where: {
                            user_id_service_project_id: {
                                user_id: user.id,
                                service_project_id: serviceProject.id
                            }
                        }
                    })

                    if (!userServiceProjectExists) {
                        await prisma.userServiceProject.create({
                            data: {
                                user_id: user.id,
                                service_project_id: serviceProject.id,
                                assigned_at: new Date().toISOString()
                            }
                        })
                    }
                }
            }

            if (body.subcontractors) {
                for (const subcontractor of body.subcontractors) {
                    const subcontractorExists = await prisma.subcontractor.findUnique({
                        where: {
                            id: subcontractor.id,
                            company_id: company.id
                        }
                    })

                    if (!subcontractorExists) {
                        return res.status(404).json({
                            error: "Subcontractor not found"
                        })
                    }

                    const subcontractorServiceProjectExists = await prisma.subContractorServiceProject.findUnique({
                        where: {
                            subcontractor_id_service_project_id: {
                                subcontractor_id: subcontractor.id,
                                service_project_id: serviceProject.id
                            }
                        }
                    })

                    if (!subcontractorServiceProjectExists) {
                        await prisma.subContractorServiceProject.create({
                            data: {
                                subcontractor_id: subcontractor.id,
                                service_project_id: serviceProject.id
                            }
                        })
                    }
                }
            }

            await prisma.serviceProject.update({
                where: {
                    id: serviceProject.id,
                    projectId: project.id
                },
                data: {
                    start_date: new Date(body.startDate).toISOString(),
                    deadline: new Date(body.deadline).toISOString()
                }
            })

            const serviceProjectData = await prisma.serviceProject.findUnique({
                where: {
                    id: serviceProject.id
                },
                select: {
                    name: true,
                    start_date: true,
                    deadline: true,
                    description: true
                }
            });

            const projectData = await prisma.project.findUnique({
                where: {
                    id: project.id
                },
                select: {
                    location: true,
                    lat: true,
                    log: true,
                    contract_number: true
                }
            });

            const removeHtml = (text: string): string => {
                return text.replace(/<[^>]*>/g, '').trim();
            };

            const serviceName = serviceProjectData?.name || 'Service';
            const serviceDescription = body.description ? removeHtml(body.description) : serviceProjectData?.description ? removeHtml(serviceProjectData.description) : undefined;
            const projectLocation = projectData?.location || 'Not specified';
            const latitude = projectData?.lat;
            const longitude = projectData?.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const startDate = serviceProjectData?.start_date || body.startDate;
            const deadline = serviceProjectData?.deadline || body.deadline;

            const allUserServiceProjects = await prisma.userServiceProject.findMany({
                where: {
                    service_project_id: serviceProject.id
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                }
            });

            const allSubcontractorServiceProjects = await prisma.subContractorServiceProject.findMany({
                where: {
                    service_project_id: serviceProject.id
                },
                include: {
                    subcontractor: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                }
            });

            const formatSGDate = (date?: string) => {
                if (!date) return 'Not set';
                return new Date(date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }) + ' (' + new Date(date).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }) + ')';
            };

            const commonDynamicData = {
                projectName: serviceName,
                contractNumber: projectData?.contract_number || "N/A",
                location: projectLocation,
                googleMapsLink: googleMapsLink,
                companyName: company?.name || "",
                startDateFormatted: formatSGDate(startDate),
                deadlineFormatted: formatSGDate(deadline),
                description: serviceDescription || "",
                currentYear: new Date().getFullYear().toString(),
            };

            if (!body.skipEmail) {
                try {
                    for (const userServiceProject of allUserServiceProjects) {
                        const user = userServiceProject.user;
                        if (user && user.email && user.name) {
                            await sendEmail({
                                to: user.email,
                                templateId: isScheduleChange
                                    ? "d-269bc2b469934e85b3e437fd98e0fcd4" // Updated
                                    : "d-c2235cb8340643d3b7e9745773f47e01", // Assigned
                                dynamicTemplateData: {
                                    ...commonDynamicData,
                                    recipientName: user.name,
                                    changes: isScheduleChange ? [
                                        { label: "Start Date", oldValue: formatSGDate(oldStartDate || undefined), newValue: formatSGDate(startDate) },
                                        { label: "Deadline", oldValue: formatSGDate(oldDeadline || undefined), newValue: formatSGDate(deadline) }
                                    ] : []
                                }
                            });
                        }
                    }

                    for (const subcontractorServiceProject of allSubcontractorServiceProjects) {
                        const subcontractor = subcontractorServiceProject.subcontractor;
                        if (subcontractor && subcontractor.email && subcontractor.name) {
                            await sendEmail({
                                to: subcontractor.email,
                                templateId: isScheduleChange
                                    ? "d-269bc2b469934e85b3e437fd98e0fcd4" // Updated
                                    : "d-c2235cb8340643d3b7e9745773f47e01", // Assigned
                                dynamicTemplateData: {
                                    ...commonDynamicData,
                                    recipientName: subcontractor.name,
                                    changes: isScheduleChange ? [
                                        { label: "Start Date", oldValue: formatSGDate(oldStartDate || undefined), newValue: formatSGDate(startDate) },
                                        { label: "Deadline", oldValue: formatSGDate(oldDeadline || undefined), newValue: formatSGDate(deadline) }
                                    ] : []
                                }
                            });
                        }
                    }
                } catch (emailError: any) {
                    console.error("Error sending assignment emails:", emailError);
                }
            }

            return res.status(201).json({
                message: "Job created successfully",
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}