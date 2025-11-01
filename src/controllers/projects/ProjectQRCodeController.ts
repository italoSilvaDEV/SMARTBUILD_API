import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import crypto from "crypto";

export class ProjectQRCodeController {
    /**
     * Gerar ou obter QR Code de um projeto
     * POST /api/projects/:projectId/qrcode
     */
    async generateOrGet(request: Request, response: Response) {
        try {
            const { projectId } = request.params;
            const { userId } = request.body;

            if (!userId) {
                return response.status(400).json({ error: 'userId é obrigatório' });
            }

            // Verificar se o projeto existe
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    client: {
                        select: {
                            name: true,
                            location: true,
                        }
                    }
                }
            });

            if (!project) {
                return response.status(404).json({ error: 'Projeto não encontrado' });
            }

            // Verificar se já existe um QR Code para este projeto
            let qrCode = await prisma.projectQRCode.findUnique({
                where: { projectId }
            });

            if (qrCode) {
                return response.json(qrCode);
            }

            // Gerar código único
            const code = crypto.randomBytes(16).toString('hex');

            // Criar QR Code
            qrCode = await prisma.projectQRCode.create({
                data: {
                    code,
                    projectId,
                    createdById: userId,
                },
                include: {
                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            location: true,
                            client: {
                                select: {
                                    name: true,
                                }
                            }
                        }
                    }
                }
            });

            return response.status(201).json(qrCode);

        } catch (error) {
            console.error('Erro ao gerar QR Code:', error);
            return response.status(500).json({ error: 'Erro ao gerar QR Code' });
        }
    }

    /**
     * Validar e acessar projeto via QR Code
     * GET /api/projects/qrcode/:code
     */
    async validateAndAccess(request: Request, response: Response) {
        try {
            const { code } = request.params;

            const qrCode = await prisma.projectQRCode.findUnique({
                where: { code },
                include: {
                    project: {
                        include: {
                            client: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                    location: true,
                                }
                            },
                            company: {
                                select: {
                                    id: true,
                                    name: true,
                                }
                            },
                            serviceProject: {
                                select: {
                                    id: true,
                                    name: true,
                                    status: true,
                                }
                            }
                        }
                    }
                }
            });

            if (!qrCode) {
                return response.status(404).json({ error: 'QR Code inválido' });
            }

            if (!qrCode.isActive) {
                return response.status(403).json({ error: 'QR Code desativado' });
            }

            // Atualizar contadores
            await prisma.projectQRCode.update({
                where: { id: qrCode.id },
                data: {
                    scans: {
                        increment: 1
                    },
                    lastScannedAt: new Date()
                }
            });

            return response.json({
                qrCode,
                project: qrCode.project
            });

        } catch (error) {
            console.error('Erro ao validar QR Code:', error);
            return response.status(500).json({ error: 'Erro ao validar QR Code' });
        }
    }

    /**
     * Desativar QR Code
     * PUT /api/projects/qrcode/:code/deactivate
     */
    async deactivate(request: Request, response: Response) {
        try {
            const { code } = request.params;

            const qrCode = await prisma.projectQRCode.findUnique({
                where: { code }
            });

            if (!qrCode) {
                return response.status(404).json({ error: 'QR Code não encontrado' });
            }

            const updatedQRCode = await prisma.projectQRCode.update({
                where: { code },
                data: {
                    isActive: false
                }
            });

            return response.json(updatedQRCode);

        } catch (error) {
            console.error('Erro ao desativar QR Code:', error);
            return response.status(500).json({ error: 'Erro ao desativar QR Code' });
        }
    }

    /**
     * Ativar QR Code
     * PUT /api/projects/qrcode/:code/activate
     */
    async activate(request: Request, response: Response) {
        try {
            const { code } = request.params;

            const qrCode = await prisma.projectQRCode.findUnique({
                where: { code }
            });

            if (!qrCode) {
                return response.status(404).json({ error: 'QR Code não encontrado' });
            }

            const updatedQRCode = await prisma.projectQRCode.update({
                where: { code },
                data: {
                    isActive: true
                }
            });

            return response.json(updatedQRCode);

        } catch (error) {
            console.error('Erro ao ativar QR Code:', error);
            return response.status(500).json({ error: 'Erro ao ativar QR Code' });
        }
    }

    /**
     * Gerar novo código para um projeto (regenerar)
     * POST /api/projects/:projectId/qrcode/regenerate
     */
    async regenerate(request: Request, response: Response) {
        try {
            const { projectId } = request.params;
            const { userId } = request.body;

            if (!userId) {
                return response.status(400).json({ error: 'userId é obrigatório' });
            }

            // Verificar se existe QR Code atual
            const existingQRCode = await prisma.projectQRCode.findUnique({
                where: { projectId }
            });

            if (!existingQRCode) {
                return response.status(404).json({ error: 'Projeto não possui QR Code' });
            }

            // Gerar novo código
            const newCode = crypto.randomBytes(16).toString('hex');

            // Atualizar QR Code
            const updatedQRCode = await prisma.projectQRCode.update({
                where: { projectId },
                data: {
                    code: newCode,
                    scans: 0,
                    lastScannedAt: null,
                },
                include: {
                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            client: {
                                select: {
                                    name: true,
                                }
                            }
                        }
                    }
                }
            });

            return response.json(updatedQRCode);

        } catch (error) {
            console.error('Erro ao regenerar QR Code:', error);
            return response.status(500).json({ error: 'Erro ao regenerar QR Code' });
        }
    }

    /**
     * Obter estatísticas do QR Code
     * GET /api/projects/:projectId/qrcode/stats
     */
    async getStats(request: Request, response: Response) {
        try {
            const { projectId } = request.params;

            const qrCode = await prisma.projectQRCode.findUnique({
                where: { projectId },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                }
            });

            if (!qrCode) {
                return response.status(404).json({ error: 'QR Code não encontrado' });
            }

            return response.json({
                totalScans: qrCode.scans,
                lastScannedAt: qrCode.lastScannedAt,
                isActive: qrCode.isActive,
                createdAt: qrCode.date_creation,
                createdBy: qrCode.createdBy,
            });

        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            return response.status(500).json({ error: 'Erro ao buscar estatísticas' });
        }
    }

    /**
     * Imprimir QR Code (retorna dados para gerar imagem)
     * GET /api/projects/:projectId/qrcode/print
     */
    async getPrintData(request: Request, response: Response) {
        try {
            const { projectId } = request.params;

            const qrCode = await prisma.projectQRCode.findUnique({
                where: { projectId },
                include: {
                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            location: true,
                            client: {
                                select: {
                                    name: true,
                                    location: true,
                                }
                            },
                            company: {
                                select: {
                                    name: true,
                                    avatar: true,
                                }
                            }
                        }
                    }
                }
            });

            if (!qrCode) {
                return response.status(404).json({ error: 'QR Code não encontrado' });
            }

            // Retornar dados formatados para impressão
            return response.json({
                code: qrCode.code,
                url: `${process.env.APP_URL}/scan/${qrCode.code}`, // URL para escanear
                project: {
                    client: qrCode.project.client?.name,
                    location: qrCode.project.location || qrCode.project.client?.location,
                    company: qrCode.project.company?.name,
                    companyLogo: qrCode.project.company?.avatar,
                },
                instructions: 'Escaneie este código QR para acessar rapidamente as informações do projeto',
            });

        } catch (error) {
            console.error('Erro ao buscar dados de impressão:', error);
            return response.status(500).json({ error: 'Erro ao buscar dados de impressão' });
        }
    }
}

