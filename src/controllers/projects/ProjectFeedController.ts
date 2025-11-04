import multer from "multer";
import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3 } from "../../utils/S3/uploadFIleS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";

const upload = multer({ dest: './public/tmp/feed' });

export class ProjectFeedController {
    async createPost(request: Request, response: Response) {
        const uploadMultiple = upload.array('photos', 10);

        uploadMultiple(request, response, async (err) => {
            if (err) {
                return response.status(400).json({
                    error: 'Erro no upload dos arquivos',
                    details: err.message
                });
            }

            try {
                const { projectId } = request.params;
                const { text, userId } = request.body;
                const files = request.files as Express.Multer.File[];

                // Validações básicas
                if (!userId) {
                    return response.status(400).json({
                        error: 'userId é obrigatório'
                    });
                }

                if (!text && (!files || files.length === 0)) {
                    return response.status(400).json({
                        error: 'É necessário enviar texto ou fotos'
                    });
                }

                // Verifica se o projeto existe
                const project = await prisma.project.findUnique({
                    where: { id: projectId },
                    select: { id: true, status_project: true }
                });

                if (!project) {
                    return response.status(404).json({
                        error: 'Projeto não encontrado'
                    });
                }

                // Verifica se o usuário existe
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                });

                if (!user) {
                    return response.status(404).json({
                        error: 'Usuário não encontrado'
                    });
                }

                // Verifica se o usuário está em ponto ativo
                const activeAttendance = await prisma.userAttendance.findFirst({
                    where: {
                        user_id: userId,
                        check_out_time: null
                    },
                    include: {
                        UserServiceProject: {
                            include: {
                                service_project: {
                                    select: {
                                        id: true,
                                        name: true,
                                        projectId: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: {
                        check_in_time: 'desc'
                    }
                });

                if (!activeAttendance) {
                    return response.status(400).json({
                        error: 'Você precisa estar em ponto para criar um post no feed'
                    });
                }

                const serviceProject = activeAttendance.UserServiceProject.service_project;

                // Verifica se o serviço pertence ao projeto correto
                if (serviceProject.projectId !== projectId) {
                    return response.status(400).json({
                        error: 'O seu ponto ativo não está vinculado a este projeto'
                    });
                }

                // Cria a activity com o texto (se houver)
                let activity = null;
                if (text && text.trim()) {
                    activity = await prisma.activities.create({
                        data: {
                            text: text.trim(),
                            authorId: userId,
                            serviceProjectId: serviceProject.id
                        },
                        include: {
                            author: {
                                select: {
                                    id: true,
                                    name: true,
                                    avatar: true
                                }
                            }
                        }
                    });
                }

                // Faz upload das fotos e salva na galeria
                const photos = [];
                if (files && files.length > 0) {
                    for (const file of files) {
                        try {
                            const fileName = await uploadFileToS3(file, '');

                            const galleryPhoto = await prisma.galleryAfter.create({
                                data: {
                                    serviceProjectId: serviceProject.id,
                                    url: fileName,
                                    title: 'FEED_POST',
                                    description: text || null
                                }
                            });

                            photos.push({
                                id: galleryPhoto.id,
                                url: await getPresignedUrl(fileName),
                                date_creation: galleryPhoto.date_creation
                            });
                        } catch (uploadError) {
                            console.error('Erro ao fazer upload da foto:', uploadError);
                        }
                    }
                }

                return response.status(201).json({
                    success: true,
                    data: {
                        activity: activity ? {
                            id: activity.id,
                            text: activity.text,
                            date_creation: activity.date_creation,
                            author: {
                                id: activity.author?.id,
                                name: activity.author?.name,
                                avatar: activity.author?.avatar ? await getPresignedUrl(activity.author.avatar) : null
                            }
                        } : null,
                        photos: photos,
                        serviceProject: {
                            id: serviceProject.id,
                            name: serviceProject.name
                        }
                    }
                });

            } catch (error) {
                console.error('Erro ao criar post no feed:', error);
                return response.status(500).json({
                    error: 'Erro interno do servidor',
                    details: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        });
    }

    /**
     * Lista o feed do projeto
     * Agrega todas as activities e fotos de todos os serviços do projeto
     */
    async getFeed(request: Request, response: Response) {
        try {
            const { projectId } = request.params;
            const { limit = '50', offset = '0' } = request.query;

            // Verifica se o projeto existe
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true }
            });

            if (!project) {
                return response.status(404).json({
                    error: 'Projeto não encontrado'
                });
            }

            // Busca todos os serviços do projeto
            const serviceProjects = await prisma.serviceProject.findMany({
                where: {
                    projectId: projectId
                },
                select: {
                    id: true,
                    name: true
                }
            });

            const serviceProjectIds = serviceProjects.map(sp => sp.id);

            if (serviceProjectIds.length === 0) {
                return response.status(200).json({
                    success: true,
                    data: {
                        posts: [],
                        total: 0
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

            // Busca fotos marcadas como FEED_POST dos serviços
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

            const photosByService = feedPhotos.reduce((acc, photo) => {
                if (!acc[photo.serviceProjectId || '']) {
                    acc[photo.serviceProjectId || ''] = [];
                }
                acc[photo.serviceProjectId || ''].push(photo);
                return acc;
            }, {} as Record<string, typeof feedPhotos>);

            // Cria posts combinados (activities + fotos do mesmo horário próximo)
            const posts = [];

            // Processa activities
            for (const activity of activities) {
                const serviceProject = serviceProjects.find(
                    sp => sp.id === activity.serviceProjectId
                );

                // Busca fotos próximas temporalmente (dentro de 5 minutos)
                const activityTime = activity.date_creation.getTime();
                const relatedPhotos = photosByService[activity.serviceProjectId || ''] || [];

                const nearbyPhotos = relatedPhotos.filter(photo => {
                    const photoTime = photo.date_creation.getTime();
                    const timeDiff = Math.abs(activityTime - photoTime);
                    return timeDiff <= 5 * 60 * 1000; // 5 minutos
                });

                const photos = await Promise.all(
                    nearbyPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    type: 'post',
                    id: activity.id,
                    text: activity.text,
                    date_creation: activity.date_creation,
                    author: {
                        id: activity.author?.id,
                        name: activity.author?.name,
                        avatar: activity.author?.avatar
                            ? await getPresignedUrl(activity.author.avatar)
                            : null
                    },
                    serviceProject: serviceProject || null,
                    photos: photos
                });
            }

            // Processa fotos que não foram associadas a nenhuma activity
            const allUsedPhotoIds = new Set(
                posts.flatMap(post => post.photos.map((p: any) => p.id))
            );

            for (const [serviceProjectId, photos] of Object.entries(photosByService)) {
                const serviceProject = serviceProjects.find(sp => sp.id === serviceProjectId);

                for (const photo of photos) {
                    if (!allUsedPhotoIds.has(photo.id)) {
                        posts.push({
                            type: 'photo_only',
                            id: photo.id,
                            text: photo.description,
                            date_creation: photo.date_creation,
                            author: null,
                            serviceProject: serviceProject || null,
                            photos: [{
                                id: photo.id,
                                url: await getPresignedUrl(photo.url),
                                date_creation: photo.date_creation
                            }]
                        });
                    }
                }
            }

            // Ordena por data (mais recente primeiro)
            posts.sort((a, b) =>
                b.date_creation.getTime() - a.date_creation.getTime()
            );

            // Aplica paginação
            const limitNum = parseInt(limit as string);
            const offsetNum = parseInt(offset as string);
            const paginatedPosts = posts.slice(offsetNum, offsetNum + limitNum);

            return response.status(200).json({
                success: true,
                data: {
                    posts: paginatedPosts,
                    total: posts.length,
                    limit: limitNum,
                    offset: offsetNum
                }
            });

        } catch (error) {
            console.error('Erro ao buscar feed do projeto:', error);
            return response.status(500).json({
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Deleta um post do feed
     */
    async deletePost(request: Request, response: Response) {
        try {
            const { postId } = request.params;
            const { type } = request.body; // 'activity' ou 'photo'

            if (!type || !['activity', 'photo'].includes(type)) {
                return response.status(400).json({
                    error: 'Tipo inválido. Use "activity" ou "photo"'
                });
            }

            if (type === 'activity') {
                const activity = await prisma.activities.findUnique({
                    where: { id: postId }
                });

                if (!activity) {
                    return response.status(404).json({
                        error: 'Activity não encontrada'
                    });
                }

                await prisma.activities.delete({
                    where: { id: postId }
                });

                return response.status(200).json({
                    success: true,
                    message: 'Post deletado com sucesso'
                });
            }

            if (type === 'photo') {
                const photo = await prisma.galleryAfter.findUnique({
                    where: { id: postId }
                });

                if (!photo) {
                    return response.status(404).json({
                        error: 'Foto não encontrada'
                    });
                }

                // Deleta do S3
                await deleteFileFromS3(photo.url);

                // Deleta do banco
                await prisma.galleryAfter.delete({
                    where: { id: postId }
                });

                return response.status(200).json({
                    success: true,
                    message: 'Foto deletada com sucesso'
                });
            }

        } catch (error) {
            console.error('Erro ao deletar post:', error);
            return response.status(500).json({
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Busca posts de um serviço específico
     */
    async getServiceFeed(request: Request, response: Response) {
        try {
            const { serviceProjectId } = request.params;

            // Verifica se o serviço existe
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: serviceProjectId },
                select: {
                    id: true,
                    name: true,
                    projectId: true
                }
            });

            if (!serviceProject) {
                return response.status(404).json({
                    error: 'Serviço não encontrado'
                });
            }

            // Busca activities do serviço
            const activities = await prisma.activities.findMany({
                where: {
                    serviceProjectId: serviceProjectId
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true
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
                    serviceProjectId: serviceProjectId,
                    title: 'FEED_POST'
                },
                orderBy: {
                    date_creation: 'desc'
                }
            });

            const posts = [];

            // Processa activities
            for (const activity of activities) {
                const activityTime = activity.date_creation.getTime();

                const nearbyPhotos = feedPhotos.filter(photo => {
                    const photoTime = photo.date_creation.getTime();
                    const timeDiff = Math.abs(activityTime - photoTime);
                    return timeDiff <= 5 * 60 * 1000;
                });

                const photos = await Promise.all(
                    nearbyPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    type: 'post',
                    id: activity.id,
                    text: activity.text,
                    date_creation: activity.date_creation,
                    author: {
                        id: activity.author?.id,
                        name: activity.author?.name,
                        avatar: activity.author?.avatar
                            ? await getPresignedUrl(activity.author.avatar)
                            : null
                    },
                    serviceProject: {
                        id: serviceProject.id,
                        name: serviceProject.name
                    },
                    photos: photos
                });
            }

            // Fotos não associadas
            const allUsedPhotoIds = new Set(
                posts.flatMap(post => post.photos.map((p: any) => p.id))
            );

            for (const photo of feedPhotos) {
                if (!allUsedPhotoIds.has(photo.id)) {
                    posts.push({
                        type: 'photo_only',
                        id: photo.id,
                        text: photo.description,
                        date_creation: photo.date_creation,
                        author: null,
                        serviceProject: {
                            id: serviceProject.id,
                            name: serviceProject.name
                        },
                        photos: [{
                            id: photo.id,
                            url: await getPresignedUrl(photo.url),
                            date_creation: photo.date_creation
                        }]
                    });
                }
            }

            posts.sort((a, b) =>
                b.date_creation.getTime() - a.date_creation.getTime()
            );

            return response.status(200).json({
                success: true,
                data: {
                    posts: posts,
                    total: posts.length,
                    serviceProject: serviceProject
                }
            });

        } catch (error) {
            console.error('Erro ao buscar feed do serviço:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Lista todos os posts de um funcionário específico
     * Agregado de todos os projetos que ele já participou
     */
    async getUserFeed(request: Request, response: Response) {
        try {
            const { userId } = request.params;
            const { limit = '50', offset = '0' } = request.query;

            // Verifica se o usuário existe
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    profession: true
                }
            });

            if (!user) {
                return response.status(404).json({ 
                    error: 'Usuário não encontrado' 
                });
            }

            // Busca todas as activities criadas por esse usuário
            const activities = await prisma.activities.findMany({
                where: {
                    authorId: userId
                },
                include: {
                    ServiceProject: {
                        select: {
                            id: true,
                            name: true,
                            projectId: true,
                            Project: {
                                select: {
                                    id: true,
                                    status_project: true,
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

            // Busca todos os serviços em que o usuário já trabalhou
            const userServiceProjects = await prisma.userServiceProject.findMany({
                where: {
                    user_id: userId
                },
                select: {
                    service_project_id: true
                }
            });

            const serviceProjectIds = userServiceProjects.map(usp => usp.service_project_id);

            // Busca fotos marcadas como FEED_POST desses serviços
            const feedPhotos = await prisma.galleryAfter.findMany({
                where: {
                    serviceProjectId: {
                        in: serviceProjectIds
                    },
                    title: 'FEED_POST'
                },
                include: {
                    ServiceProject: {
                        select: {
                            id: true,
                            name: true,
                            projectId: true,
                            Project: {
                                select: {
                                    id: true,
                                    status_project: true,
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

            // Agrupa fotos por serviço
            const photosByService = feedPhotos.reduce((acc, photo) => {
                if (!acc[photo.serviceProjectId || '']) {
                    acc[photo.serviceProjectId || ''] = [];
                }
                acc[photo.serviceProjectId || ''].push(photo);
                return acc;
            }, {} as Record<string, typeof feedPhotos>);

            // Cria posts combinados
            const posts = [];

            // Processa activities
            for (const activity of activities) {
                const activityTime = activity.date_creation.getTime();
                const relatedPhotos = photosByService[activity.serviceProjectId || ''] || [];
                
                const nearbyPhotos = relatedPhotos.filter(photo => {
                    const photoTime = photo.date_creation.getTime();
                    const timeDiff = Math.abs(activityTime - photoTime);
                    return timeDiff <= 5 * 60 * 1000; // 5 minutos
                });

                const photos = await Promise.all(
                    nearbyPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    type: 'post',
                    id: activity.id,
                    text: activity.text,
                    date_creation: activity.date_creation,
                    serviceProject: activity.ServiceProject ? {
                        id: activity.ServiceProject.id,
                        name: activity.ServiceProject.name
                    } : null,
                    project: activity.ServiceProject?.Project ? {
                        id: activity.ServiceProject.Project.id,
                        status: activity.ServiceProject.Project.status_project,
                        client: activity.ServiceProject.Project.client
                    } : null,
                    photos: photos
                });
            }

            // Processa fotos não associadas a activities
            const allUsedPhotoIds = new Set(
                posts.flatMap(post => post.photos.map((p: any) => p.id))
            );

            for (const [serviceProjectId, photos] of Object.entries(photosByService)) {
                for (const photo of photos) {
                    if (!allUsedPhotoIds.has(photo.id)) {
                        posts.push({
                            type: 'photo_only',
                            id: photo.id,
                            text: photo.description,
                            date_creation: photo.date_creation,
                            serviceProject: photo.ServiceProject ? {
                                id: photo.ServiceProject.id,
                                name: photo.ServiceProject.name
                            } : null,
                            project: photo.ServiceProject?.Project ? {
                                id: photo.ServiceProject.Project.id,
                                status: photo.ServiceProject.Project.status_project,
                                client: photo.ServiceProject.Project.client
                            } : null,
                            photos: [{
                                id: photo.id,
                                url: await getPresignedUrl(photo.url),
                                date_creation: photo.date_creation
                            }]
                        });
                    }
                }
            }

            // Ordena por data (mais recente primeiro)
            posts.sort((a, b) => 
                b.date_creation.getTime() - a.date_creation.getTime()
            );

            // Aplica paginação
            const limitNum = parseInt(limit as string);
            const offsetNum = parseInt(offset as string);
            const paginatedPosts = posts.slice(offsetNum, offsetNum + limitNum);

            // Agrupa posts por projeto para estatísticas
            const projectStats = posts.reduce((acc, post) => {
                if (post.project) {
                    const projectId = post.project.id;
                    if (!acc[projectId]) {
                        acc[projectId] = {
                            projectId: projectId,
                            client: post.project.client,
                            postsCount: 0
                        };
                    }
                    acc[projectId].postsCount++;
                }
                return acc;
            }, {} as Record<string, any>);

            return response.status(200).json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        name: user.name,
                        avatar: user.avatar ? await getPresignedUrl(user.avatar) : null,
                        profession: user.profession
                    },
                    posts: paginatedPosts,
                    total: posts.length,
                    limit: limitNum,
                    offset: offsetNum,
                    statistics: {
                        totalPosts: posts.length,
                        totalPhotos: posts.reduce((sum, post) => sum + post.photos.length, 0),
                        projectsCount: Object.keys(projectStats).length,
                        projects: Object.values(projectStats)
                    }
                }
            });

        } catch (error) {
            console.error('Erro ao buscar feed do usuário:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }
}

