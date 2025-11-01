import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";

export class ProjectFeedShareController {
    /**
     * Criar link de compartilhamento do feed
     * POST /api/projects/:projectId/feed/share
     */
    async create(request: Request, response: Response) {
        try {
            const { projectId } = request.params;
            const {
                userId,
                expiresIn, // em dias
                password,
                allowDownload,
                includeTypes, // Array de tipos: ['PHOTO', 'VIDEO']
                startDate,
                endDate
            } = request.body;

            if (!userId) {
                return response.status(400).json({ error: 'userId é obrigatório' });
            }

            // Verificar se o projeto existe
            const project = await prisma.project.findUnique({
                where: { id: projectId }
            });

            if (!project) {
                return response.status(404).json({ error: 'Projeto não encontrado' });
            }

            // Gerar token único
            const shareToken = crypto.randomBytes(32).toString('hex');

            // Calcular data de expiração
            let expiresAt = null;
            if (expiresIn) {
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + parseInt(expiresIn));
            }

            // Hash da senha se fornecida
            let hashedPassword = null;
            if (password) {
                hashedPassword = await bcrypt.hash(password, 10);
            }

            // Criar compartilhamento
            const share = await prisma.projectFeedShare.create({
                data: {
                    shareToken,
                    projectId,
                    createdById: userId,
                    expiresAt,
                    password: hashedPassword,
                    allowDownload: allowDownload || false,
                    includeTypes: includeTypes ? JSON.stringify(includeTypes) : null,
                    startDate: startDate ? new Date(startDate) : null,
                    endDate: endDate ? new Date(endDate) : null,
                },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            name: true,
                        }
                    },
                    project: {
                        select: {
                            id: true,
                            client: {
                                select: {
                                    name: true,
                                }
                            }
                        }
                    }
                }
            });

            return response.status(201).json({
                ...share,
                shareUrl: `${process.env.APP_URL}/shared-feed/${shareToken}`,
                password: undefined, // Não retornar o hash
            });

        } catch (error) {
            console.error('Erro ao criar compartilhamento:', error);
            return response.status(500).json({ error: 'Erro ao criar compartilhamento' });
        }
    }

    /**
     * Acessar feed compartilhado
     * GET /api/projects/feed/shared/:token
     */
    async access(request: Request, response: Response) {
        try {
            const { token } = request.params;
            const { password } = request.body;

            const share = await prisma.projectFeedShare.findUnique({
                where: { shareToken: token },
                include: {
                    project: {
                        include: {
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

            if (!share) {
                return response.status(404).json({ error: 'Link de compartilhamento não encontrado' });
            }

            // Verificar expiração
            if (share.expiresAt && share.expiresAt < new Date()) {
                return response.status(403).json({ error: 'Link expirado' });
            }

            // Verificar senha
            if (share.password) {
                if (!password) {
                    return response.status(401).json({ 
                        error: 'Senha necessária',
                        requiresPassword: true 
                    });
                }

                const isPasswordValid = await bcrypt.compare(password, share.password);
                if (!isPasswordValid) {
                    return response.status(401).json({ error: 'Senha incorreta' });
                }
            }

            // Incrementar visualizações
            await prisma.projectFeedShare.update({
                where: { id: share.id },
                data: {
                    views: {
                        increment: 1
                    }
                }
            });

            // Construir filtros para o feed
            const feedWhere: any = { 
                projectId: share.project.id,
                isPublic: true // Apenas posts públicos
            };

            // Aplicar filtros de tipo
            if (share.includeTypes) {
                const types = JSON.parse(share.includeTypes);
                feedWhere.type = { in: types };
            }

            // Aplicar filtros de data
            if (share.startDate || share.endDate) {
                feedWhere.date_creation = {};
                if (share.startDate) {
                    feedWhere.date_creation.gte = share.startDate;
                }
                if (share.endDate) {
                    feedWhere.date_creation.lte = share.endDate;
                }
            }

            // Buscar posts do feed
            const feedPosts = await prisma.projectFeed.findMany({
                where: feedWhere,
                include: {
                    author: {
                        select: {
                            name: true,
                            avatar: true,
                        }
                    },
                    media: true,
                    _count: {
                        select: {
                            comments: true,
                            reactions: true,
                        }
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            return response.json({
                project: {
                    client: share.project.client?.name,
                    location: share.project.location,
                    company: share.project.company,
                },
                allowDownload: share.allowDownload,
                posts: feedPosts,
                totalViews: share.views + 1,
            });

        } catch (error) {
            console.error('Erro ao acessar feed compartilhado:', error);
            return response.status(500).json({ error: 'Erro ao acessar feed compartilhado' });
        }
    }

    /**
     * Listar todos os compartilhamentos de um projeto
     * GET /api/projects/:projectId/feed/shares
     */
    async list(request: Request, response: Response) {
        try {
            const { projectId } = request.params;

            const shares = await prisma.projectFeedShare.findMany({
                where: { projectId },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            // Adicionar URLs e remover senhas
            const sharesWithUrls = shares.map(share => ({
                ...share,
                shareUrl: `${process.env.APP_URL}/shared-feed/${share.shareToken}`,
                password: share.password ? '***' : null, // Indicar se tem senha sem expor
                isExpired: share.expiresAt ? share.expiresAt < new Date() : false,
            }));

            return response.json(sharesWithUrls);

        } catch (error) {
            console.error('Erro ao listar compartilhamentos:', error);
            return response.status(500).json({ error: 'Erro ao listar compartilhamentos' });
        }
    }

    /**
     * Atualizar compartilhamento
     * PUT /api/projects/feed/share/:shareId
     */
    async update(request: Request, response: Response) {
        try {
            const { shareId } = request.params;
            const {
                expiresIn,
                password,
                allowDownload,
                includeTypes,
                startDate,
                endDate
            } = request.body;

            const share = await prisma.projectFeedShare.findUnique({
                where: { id: shareId }
            });

            if (!share) {
                return response.status(404).json({ error: 'Compartilhamento não encontrado' });
            }

            // Preparar dados de atualização
            const updateData: any = {};

            if (expiresIn !== undefined) {
                if (expiresIn === null) {
                    updateData.expiresAt = null;
                } else {
                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + parseInt(expiresIn));
                    updateData.expiresAt = expiresAt;
                }
            }

            if (password !== undefined) {
                if (password === null) {
                    updateData.password = null;
                } else {
                    updateData.password = await bcrypt.hash(password, 10);
                }
            }

            if (allowDownload !== undefined) {
                updateData.allowDownload = allowDownload;
            }

            if (includeTypes !== undefined) {
                updateData.includeTypes = includeTypes ? JSON.stringify(includeTypes) : null;
            }

            if (startDate !== undefined) {
                updateData.startDate = startDate ? new Date(startDate) : null;
            }

            if (endDate !== undefined) {
                updateData.endDate = endDate ? new Date(endDate) : null;
            }

            const updatedShare = await prisma.projectFeedShare.update({
                where: { id: shareId },
                data: updateData,
            });

            return response.json({
                ...updatedShare,
                shareUrl: `${process.env.APP_URL}/shared-feed/${updatedShare.shareToken}`,
                password: undefined,
            });

        } catch (error) {
            console.error('Erro ao atualizar compartilhamento:', error);
            return response.status(500).json({ error: 'Erro ao atualizar compartilhamento' });
        }
    }

    /**
     * Deletar compartilhamento
     * DELETE /api/projects/feed/share/:shareId
     */
    async delete(request: Request, response: Response) {
        try {
            const { shareId } = request.params;

            await prisma.projectFeedShare.delete({
                where: { id: shareId }
            });

            return response.json({ message: 'Compartilhamento deletado com sucesso' });

        } catch (error) {
            console.error('Erro ao deletar compartilhamento:', error);
            return response.status(500).json({ error: 'Erro ao deletar compartilhamento' });
        }
    }

    /**
     * Obter estatísticas de um compartilhamento
     * GET /api/projects/feed/share/:shareId/stats
     */
    async getStats(request: Request, response: Response) {
        try {
            const { shareId } = request.params;

            const share = await prisma.projectFeedShare.findUnique({
                where: { id: shareId },
                include: {
                    createdBy: {
                        select: {
                            name: true,
                        }
                    }
                }
            });

            if (!share) {
                return response.status(404).json({ error: 'Compartilhamento não encontrado' });
            }

            const isExpired = share.expiresAt ? share.expiresAt < new Date() : false;

            return response.json({
                totalViews: share.views,
                createdAt: share.date_creation,
                expiresAt: share.expiresAt,
                isExpired,
                hasPassword: !!share.password,
                allowDownload: share.allowDownload,
                createdBy: share.createdBy.name,
            });

        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            return response.status(500).json({ error: 'Erro ao buscar estatísticas' });
        }
    }
}

