import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import crypto from "crypto";

export class PublicFeedLinkController {
    /**
     * Criar link público para um projeto
     * POST /api/projects/:projectId/public-link
     */
    async createPublicLink(request: Request, response: Response) {
        try {
            const { projectId } = request.params;
            const { expiresIn } = request.body; // dias (opcional)
            const userId = request.body.userId || (request as any).userId; // ID do usuário autenticado

            if (!userId) {
                return response.status(400).json({
                    success: false,
                    error: 'userId é obrigatório'
                });
            }

            // Verifica se o projeto existe
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                select: { 
                    id: true,
                    client: {
                        select: {
                            name: true
                        }
                    }
                }
            });

            if (!project) {
                return response.status(404).json({
                    success: false,
                    error: 'Projeto não encontrado'
                });
            }

            // Verifica se já existe um link ativo para este projeto
            const existingLink = await prisma.publicFeedLink.findFirst({
                where: {
                    projectId: projectId,
                    isActive: true
                }
            });

            // Se já existe, retorna o existente
            if (existingLink) {
                const baseUrl = process.env.FRONTEND_URL || 'https://smartbuild.codelabsusa.com';
                const url = `${baseUrl}/public/feed/${existingLink.token}`;

                return response.status(200).json({
                    success: true,
                    message: 'Link público já existe para este projeto',
                    data: {
                        id: existingLink.id,
                        token: existingLink.token,
                        projectId: existingLink.projectId,
                        url: url,
                        expiresAt: existingLink.expiresAt,
                        createdAt: existingLink.date_creation,
                        isActive: existingLink.isActive,
                        accessCount: existingLink.accessCount
                    }
                });
            }

            // Gera token único (32 bytes = 64 caracteres em hex)
            const token = crypto.randomBytes(32).toString('hex');

            // Calcula data de expiração se fornecida
            let expiresAt: Date | null = null;
            if (expiresIn && typeof expiresIn === 'number' && expiresIn > 0) {
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + expiresIn);
            }

            // Cria o link público
            const publicLink = await prisma.publicFeedLink.create({
                data: {
                    token: token,
                    projectId: projectId,
                    createdBy: userId,
                    expiresAt: expiresAt,
                    isActive: true
                }
            });

            const baseUrl = process.env.FRONTEND_URL || 'https://smartbuild.codelabsusa.com';
            const url = `${baseUrl}/public/feed/${publicLink.token}`;

            return response.status(201).json({
                success: true,
                data: {
                    id: publicLink.id,
                    token: publicLink.token,
                    projectId: publicLink.projectId,
                    url: url,
                    expiresAt: publicLink.expiresAt,
                    createdAt: publicLink.date_creation
                }
            });

        } catch (error) {
            console.error('Erro ao criar link público:', error);
            return response.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Acessar feed via link público
     * GET /api/public/feed/:token
     */
    async getPublicFeed(request: Request, response: Response) {
        try {
            const { token } = request.params;
            const { 
                limit = '50', 
                offset = '0',
                sortBy = 'date',
                order = 'desc'
            } = request.query;

            // Busca o link pelo token
            const publicLink = await prisma.publicFeedLink.findUnique({
                where: { token: token },
                include: {
                    project: {
                        include: {
                            client: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            });

            // Validações
            if (!publicLink) {
                return response.status(404).json({
                    success: false,
                    error: 'Link expired or invalid'
                });
            }

            if (!publicLink.isActive) {
                return response.status(403).json({
                    success: false,
                    error: 'Link expired or invalid'
                });
            }

            // Verifica expiração
            if (publicLink.expiresAt && new Date() > publicLink.expiresAt) {
                return response.status(403).json({
                    success: false,
                    error: 'Link expired or invalid'
                });
            }

            // Incrementa contador de acessos
            await prisma.publicFeedLink.update({
                where: { id: publicLink.id },
                data: {
                    accessCount: { increment: 1 },
                    lastAccessAt: new Date()
                }
            });

            // Busca todos os serviços do projeto
            const serviceProjects = await prisma.serviceProject.findMany({
                where: {
                    projectId: publicLink.projectId
                },
                select: {
                    id: true,
                    name: true,
                    projectId: true
                }
            });

            const serviceProjectIds = serviceProjects.map(sp => sp.id);

            if (serviceProjectIds.length === 0) {
                return response.status(200).json({
                    success: true,
                    data: {
                        project: {
                            id: publicLink.project?.id || '',
                            clientName: publicLink.project?.client?.name || 'N/A',
                            address: publicLink.project?.location || 'N/A'
                        },
                        posts: [],
                        pagination: {
                            total: 0,
                            limit: parseInt(limit as string),
                            offset: parseInt(offset as string),
                            hasMore: false
                        }
                    }
                });
            }

            // Busca activities dos serviços
            const activities = await prisma.activities.findMany({
                where: {
                    serviceProjectId: {
                        in: serviceProjectIds
                    }
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true
                        }
                    },
                    ServiceProject: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            // Busca fotos marcadas como FEED_POST
            const feedPhotos = await prisma.galleryAfter.findMany({
                where: {
                    serviceProjectId: {
                        in: serviceProjectIds
                    },
                    title: 'FEED_POST'
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            // Agrupa fotos por activity.id
            const photosByActivityId = feedPhotos.reduce((acc, photo) => {
                const activityId = photo.description || 'unlinked';
                if (!acc[activityId]) {
                    acc[activityId] = [];
                }
                acc[activityId].push(photo);
                return acc;
            }, {} as Record<string, typeof feedPhotos>);

            // Busca contadores de likes e comentários
            const activityIds = activities.map(a => a.id);
            
            const likesCount = await prisma.feedLike.groupBy({
                by: ['activityId'],
                where: {
                    activityId: { in: activityIds }
                },
                _count: {
                    activityId: true
                }
            });

            const commentsCount = await prisma.feedComment.groupBy({
                by: ['activityId'],
                where: {
                    activityId: { in: activityIds }
                },
                _count: {
                    activityId: true
                }
            });

            const likesMap = likesCount.reduce((acc, item) => {
                acc[item.activityId] = item._count.activityId;
                return acc;
            }, {} as Record<string, number>);

            const commentsMap = commentsCount.reduce((acc, item) => {
                acc[item.activityId] = item._count.activityId;
                return acc;
            }, {} as Record<string, number>);

            // Cria posts combinados
            const posts = [];

            for (const activity of activities) {
                const serviceProject = serviceProjects.find(
                    sp => sp.id === activity.serviceProjectId
                );

                const linkedPhotos = photosByActivityId[activity.id] || [];
                
                const photos = await Promise.all(
                    linkedPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    id: activity.id,
                    text: activity.text === '📷' ? null : activity.text,
                    date_creation: activity.date_creation,
                    author: {
                        id: activity.author?.id,
                        name: activity.author?.name,
                        avatar: activity.author?.avatar 
                            ? await getPresignedUrl(activity.author.avatar)
                            : null
                    },
                    serviceProject: serviceProject ? {
                        name: serviceProject.name
                    } : null,
                    location: {
                        address: publicLink.project?.location || 'N/A',
                        coordinates: {
                            lat: publicLink.project?.lat ? parseFloat(publicLink.project.lat) : null,
                            lng: publicLink.project?.log ? parseFloat(publicLink.project.log) : null
                        }
                    },
                    photos: photos,
                    likesCount: likesMap[activity.id] || 0,
                    commentsCount: commentsMap[activity.id] || 0
                });
            }

            // Ordena os posts
            const orderMultiplier = order === 'asc' ? 1 : -1;
            posts.sort((a, b) => {
                return (b.date_creation.getTime() - a.date_creation.getTime()) * orderMultiplier;
            });

            // Aplica paginação
            const limitNum = parseInt(limit as string);
            const offsetNum = parseInt(offset as string);
            const totalPosts = posts.length;
            const hasMore = offsetNum + limitNum < totalPosts;

            const paginatedPosts = posts.slice(offsetNum, offsetNum + limitNum);

            return response.status(200).json({
                success: true,
                data: {
                    project: {
                        id: publicLink.project?.id || '',
                        clientName: publicLink.project?.client?.name || 'N/A',
                        address: publicLink.project?.location || 'N/A'
                    },
                    posts: paginatedPosts,
                    pagination: {
                        total: totalPosts,
                        limit: limitNum,
                        offset: offsetNum,
                        hasMore: hasMore
                    }
                }
            });

        } catch (error) {
            console.error('Erro ao buscar feed público:', error);
            return response.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Listar todos os links de um projeto
     * GET /api/projects/:projectId/public-links
     */
    async getProjectPublicLinks(request: Request, response: Response) {
        try {
            const { projectId } = request.params;

            // Verifica se o projeto existe
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true }
            });

            if (!project) {
                return response.status(404).json({
                    success: false,
                    error: 'Projeto não encontrado'
                });
            }

            // Busca todos os links do projeto
            const links = await prisma.publicFeedLink.findMany({
                where: {
                    projectId: projectId
                },
                include: {
                    creator: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            const baseUrl = process.env.FRONTEND_URL || 'https://smartbuild.codelabsusa.com';

            const linksWithUrls = links.map(link => ({
                id: link.id,
                token: link.token,
                url: `${baseUrl}/public/feed/${link.token}`,
                isActive: link.isActive,
                expiresAt: link.expiresAt,
                createdAt: link.date_creation,
                accessCount: link.accessCount,
                lastAccessAt: link.lastAccessAt,
                createdBy: {
                    id: link.creator.id,
                    name: link.creator.name
                }
            }));

            return response.status(200).json({
                success: true,
                data: linksWithUrls
            });

        } catch (error) {
            console.error('Erro ao buscar links públicos:', error);
            return response.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Desativar link público
     * DELETE /api/public-links/:linkId
     */
    async deactivatePublicLink(request: Request, response: Response) {
        try {
            const { linkId } = request.params;

            const link = await prisma.publicFeedLink.findUnique({
                where: { id: linkId },
                select: { id: true }
            });

            if (!link) {
                return response.status(404).json({
                    success: false,
                    error: 'Link não encontrado'
                });
            }

            // Desativa o link (não deleta)
            await prisma.publicFeedLink.update({
                where: { id: linkId },
                data: {
                    isActive: false
                }
            });

            return response.status(200).json({
                success: true,
                message: 'Public link deactivated'
            });

        } catch (error) {
            console.error('Erro ao desativar link:', error);
            return response.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Reativar link público
     * PATCH /api/public-links/:linkId/activate
     */
    async activatePublicLink(request: Request, response: Response) {
        try {
            const { linkId } = request.params;

            const link = await prisma.publicFeedLink.findUnique({
                where: { id: linkId },
                select: { id: true, expiresAt: true }
            });

            if (!link) {
                return response.status(404).json({
                    success: false,
                    error: 'Link não encontrado'
                });
            }

            // Verifica se o link não está expirado
            if (link.expiresAt && new Date() > link.expiresAt) {
                return response.status(400).json({
                    success: false,
                    error: 'Não é possível reativar um link expirado'
                });
            }

            // Reativa o link
            const updatedLink = await prisma.publicFeedLink.update({
                where: { id: linkId },
                data: {
                    isActive: true
                }
            });

            return response.status(200).json({
                success: true,
                data: {
                    id: updatedLink.id,
                    isActive: updatedLink.isActive
                }
            });

        } catch (error) {
            console.error('Erro ao reativar link:', error);
            return response.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Criar link público para múltiplos projetos
     * POST /feed/public-link/multi-project
     */
    async createMultiProjectLink(request: Request, response: Response) {
        try {
            const { projectIds, expiresIn } = request.body;
            const userId = request.body.userId || (request as any).userId;

            // Validações
            if (!userId) {
                return response.status(400).json({
                    success: false,
                    error: 'userId é obrigatório'
                });
            }

            if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
                return response.status(400).json({
                    success: false,
                    error: 'projectIds é obrigatório e deve conter pelo menos um projeto'
                });
            }

            // Verifica se todos os projetos existem
            const projects = await prisma.project.findMany({
                where: {
                    id: {
                        in: projectIds
                    }
                },
                select: {
                    id: true,
                    client: {
                        select: {
                            name: true
                        }
                    }
                }
            });

            if (projects.length !== projectIds.length) {
                return response.status(404).json({
                    success: false,
                    error: 'Um ou mais projetos não foram encontrados'
                });
            }

            // Gera token único
            const token = crypto.randomBytes(32).toString('hex');

            // Calcula data de expiração se fornecida
            let expiresAt: Date | null = null;
            if (expiresIn && typeof expiresIn === 'number' && expiresIn > 0) {
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + expiresIn);
            }

            // Cria o link público sem projectId (multi-project)
            const publicLink = await prisma.publicFeedLink.create({
                data: {
                    token: token,
                    createdBy: userId,
                    expiresAt: expiresAt,
                    isActive: true,
                    // Cria os relacionamentos com os projetos
                    projects: {
                        create: projectIds.map((projectId: string) => ({
                            projectId: projectId
                        }))
                    }
                },
                include: {
                    projects: {
                        select: {
                            projectId: true
                        }
                    }
                }
            });

            const baseUrl = process.env.FRONTEND_URL || 'https://smartbuild.codelabsusa.com';
            const url = `${baseUrl}/public/feed/multi/${publicLink.token}`;

            return response.status(201).json({
                success: true,
                data: {
                    id: publicLink.id,
                    token: publicLink.token,
                    projectIds: publicLink.projects.map(p => p.projectId),
                    url: url,
                    expiresAt: publicLink.expiresAt,
                    createdAt: publicLink.date_creation,
                    isActive: publicLink.isActive
                }
            });

        } catch (error) {
            console.error('Erro ao criar link multi-projeto:', error);
            return response.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Acessar feed de múltiplos projetos via link público
     * GET /public/feed/multi/:token
     */
    async getMultiProjectFeed(request: Request, response: Response) {
        try {
            const { token } = request.params;
            const { 
                limit = '50', 
                offset = '0',
                sortBy = 'date',
                order = 'desc'
            } = request.query;

            // Busca o link pelo token com os projetos relacionados
            const publicLink = await prisma.publicFeedLink.findUnique({
                where: { token: token },
                include: {
                    projects: {
                        include: {
                            project: {
                                include: {
                                    client: {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            // Validações
            if (!publicLink) {
                return response.status(404).json({
                    success: false,
                    error: 'Link expired or invalid'
                });
            }

            if (!publicLink.isActive) {
                return response.status(403).json({
                    success: false,
                    error: 'Link expired or invalid'
                });
            }

            // Verifica expiração
            if (publicLink.expiresAt && new Date() > publicLink.expiresAt) {
                return response.status(403).json({
                    success: false,
                    error: 'Link expired or invalid'
                });
            }

            // Verifica se tem projetos vinculados
            if (publicLink.projects.length === 0) {
                return response.status(404).json({
                    success: false,
                    error: 'Nenhum projeto vinculado a este link'
                });
            }

            // Incrementa contador de acessos
            await prisma.publicFeedLink.update({
                where: { id: publicLink.id },
                data: {
                    accessCount: { increment: 1 },
                    lastAccessAt: new Date()
                }
            });

            // Extrai IDs dos projetos
            const projectIds = publicLink.projects.map(p => p.projectId);

            // Busca todos os serviços dos projetos
            const serviceProjects = await prisma.serviceProject.findMany({
                where: {
                    projectId: {
                        in: projectIds
                    }
                },
                select: {
                    id: true,
                    name: true,
                    projectId: true
                }
            });

            const serviceProjectIds = serviceProjects.map(sp => sp.id);

            if (serviceProjectIds.length === 0) {
                // Retorna informações dos projetos mesmo sem posts
                const projectsInfo = publicLink.projects.map(p => ({
                    id: p.project.id,
                    clientName: p.project.client?.name || 'N/A',
                    address: p.project.location || 'N/A'
                }));

                return response.status(200).json({
                    success: true,
                    data: {
                        projects: projectsInfo,
                        posts: [],
                        pagination: {
                            total: 0,
                            limit: parseInt(limit as string),
                            offset: parseInt(offset as string),
                            hasMore: false
                        }
                    }
                });
            }

            // Busca activities dos serviços
            const activities = await prisma.activities.findMany({
                where: {
                    serviceProjectId: {
                        in: serviceProjectIds
                    }
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true
                        }
                    },
                    ServiceProject: {
                        select: {
                            id: true,
                            name: true,
                            projectId: true,
                            Project: {
                                select: {
                                    id: true,
                                    location: true,
                                    lat: true,
                                    log: true,
                                    client: {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            // Busca fotos marcadas como FEED_POST
            const feedPhotos = await prisma.galleryAfter.findMany({
                where: {
                    serviceProjectId: {
                        in: serviceProjectIds
                    },
                    title: 'FEED_POST'
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            // Agrupa fotos por activity.id
            const photosByActivityId = feedPhotos.reduce((acc, photo) => {
                const activityId = photo.description || 'unlinked';
                if (!acc[activityId]) {
                    acc[activityId] = [];
                }
                acc[activityId].push(photo);
                return acc;
            }, {} as Record<string, typeof feedPhotos>);

            // Busca contadores de likes e comentários
            const activityIds = activities.map(a => a.id);
            
            const likesCount = await prisma.feedLike.groupBy({
                by: ['activityId'],
                where: {
                    activityId: { in: activityIds }
                },
                _count: {
                    activityId: true
                }
            });

            const commentsCount = await prisma.feedComment.groupBy({
                by: ['activityId'],
                where: {
                    activityId: { in: activityIds }
                },
                _count: {
                    activityId: true
                }
            });

            const likesMap = likesCount.reduce((acc, item) => {
                acc[item.activityId] = item._count.activityId;
                return acc;
            }, {} as Record<string, number>);

            const commentsMap = commentsCount.reduce((acc, item) => {
                acc[item.activityId] = item._count.activityId;
                return acc;
            }, {} as Record<string, number>);

            // Cria posts combinados
            const posts = [];

            for (const activity of activities) {
                const linkedPhotos = photosByActivityId[activity.id] || [];
                
                const photos = await Promise.all(
                    linkedPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    id: activity.id,
                    text: activity.text === '📷' ? null : activity.text,
                    date_creation: activity.date_creation,
                    author: {
                        id: activity.author?.id,
                        name: activity.author?.name,
                        avatar: activity.author?.avatar 
                            ? await getPresignedUrl(activity.author.avatar)
                            : null
                    },
                    serviceProject: activity.ServiceProject ? {
                        name: activity.ServiceProject.name
                    } : null,
                    project: activity.ServiceProject?.Project ? {
                        id: activity.ServiceProject.Project.id,
                        clientName: activity.ServiceProject.Project.client?.name || 'N/A'
                    } : null,
                    location: activity.ServiceProject?.Project ? {
                        address: activity.ServiceProject.Project.location || 'N/A',
                        coordinates: {
                            lat: activity.ServiceProject.Project.lat ? parseFloat(activity.ServiceProject.Project.lat) : null,
                            lng: activity.ServiceProject.Project.log ? parseFloat(activity.ServiceProject.Project.log) : null
                        }
                    } : null,
                    photos: photos,
                    likesCount: likesMap[activity.id] || 0,
                    commentsCount: commentsMap[activity.id] || 0
                });
            }

            // Ordena os posts
            const orderMultiplier = order === 'asc' ? 1 : -1;
            posts.sort((a, b) => {
                return (b.date_creation.getTime() - a.date_creation.getTime()) * orderMultiplier;
            });

            // Aplica paginação
            const limitNum = parseInt(limit as string);
            const offsetNum = parseInt(offset as string);
            const totalPosts = posts.length;
            const hasMore = offsetNum + limitNum < totalPosts;

            const paginatedPosts = posts.slice(offsetNum, offsetNum + limitNum);

            // Informações dos projetos
            const projectsInfo = publicLink.projects.map(p => ({
                id: p.project.id,
                clientName: p.project.client?.name || 'N/A',
                address: p.project.location || 'N/A'
            }));

            return response.status(200).json({
                success: true,
                data: {
                    projects: projectsInfo,
                    posts: paginatedPosts,
                    pagination: {
                        total: totalPosts,
                        limit: limitNum,
                        offset: offsetNum,
                        hasMore: hasMore
                    }
                }
            });

        } catch (error) {
            console.error('Erro ao buscar feed multi-projeto:', error);
            return response.status(500).json({
                success: false,
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }
}

