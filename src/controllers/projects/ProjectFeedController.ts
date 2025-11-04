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
                const { id } = request.params; // Aceita projectId OU serviceProjectId
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

                // Tenta encontrar como project primeiro
                let project = await prisma.project.findUnique({
                    where: { id: id },
                    select: { id: true, status_project: true }
                });

                let projectId = id;

                // Se não encontrar, tenta como serviceProject
                if (!project) {
                    const serviceProject = await prisma.serviceProject.findUnique({
                        where: { id: id },
                        select: {
                            id: true,
                            projectId: true,
                            Project: {
                                select: {
                                    id: true,
                                    status_project: true
                                }
                            }
                        }
                    });

                    if (serviceProject?.Project) {
                        project = serviceProject.Project;
                        projectId = serviceProject.projectId!;
                    }
                }

                if (!project) {
                    return response.status(404).json({
                        error: 'Projeto ou serviço não encontrado'
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

                // SEMPRE cria uma activity (post), mesmo que seja só fotos
                // Isso garante que cada post seja independente e não agrupe com posts antigos
                const postText = text && text.trim() ? text.trim() : '📷'; // Usa emoji se só tiver fotos
                
                const activity = await prisma.activities.create({
                    data: {
                        text: postText,
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
                                    description: activity.id // Vincula a foto ao post específico
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
                        activity: {
                            id: activity.id,
                            text: activity.text === '📷' ? null : activity.text, // Retorna null se for só emoji
                            date_creation: activity.date_creation,
                            author: {
                                id: activity.author?.id,
                                name: activity.author?.name,
                                avatar: activity.author?.avatar ? await getPresignedUrl(activity.author.avatar) : null
                            }
                        },
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
            const { 
                limit = '50', 
                offset = '0',
                // Filtros
                serviceProjectId,
                startDate,
                endDate,
                hasPhotos,
                authorId,
                // Ordenação
                sortBy = 'date', // 'date' ou 'photos'
                order = 'desc' // 'asc' ou 'desc'
            } = request.query;

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

            // Busca todos os serviços do projeto (com informações de localização)
            const serviceProjects = await prisma.serviceProject.findMany({
                where: {
                    projectId: projectId
                },
                select: {
                    id: true,
                    name: true,
                    Project: {
                        select: {
                            id: true,
                            location: true,
                            lat: true,
                            log: true
                        }
                    }
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

            // Monta filtros para activities
            const activityFilters: any = {
                serviceProjectId: {
                    in: serviceProjectIds
                }
            };

            // Filtro por serviço específico
            if (serviceProjectId && typeof serviceProjectId === 'string') {
                activityFilters.serviceProjectId = serviceProjectId;
            }

            // Filtro por autor
            if (authorId && typeof authorId === 'string') {
                activityFilters.authorId = authorId;
            }

            // Filtro por data
            if (startDate || endDate) {
                activityFilters.date_creation = {};
                if (startDate && typeof startDate === 'string') {
                    activityFilters.date_creation.gte = new Date(startDate);
                }
                if (endDate && typeof endDate === 'string') {
                    activityFilters.date_creation.lte = new Date(endDate);
                }
            }

            // Busca activities dos serviços com filtros
            const activities = await prisma.activities.findMany({
                where: activityFilters,
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

            // Agrupa fotos por activity.id (armazenado no campo description)
            const photosByActivityId = feedPhotos.reduce((acc, photo) => {
                const activityId = photo.description || 'unlinked';
                if (!acc[activityId]) {
                    acc[activityId] = [];
                }
                acc[activityId].push(photo);
                return acc;
            }, {} as Record<string, typeof feedPhotos>);

            // Cria posts combinados (activities + suas fotos vinculadas)
            const posts = [];

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

            // Processa activities
            for (const activity of activities) {
                const serviceProject = serviceProjects.find(
                    sp => sp.id === activity.serviceProjectId
                );

                // Busca fotos vinculadas diretamente a este post (pelo activity.id)
                const linkedPhotos = photosByActivityId[activity.id] || [];
                
                const photos = await Promise.all(
                    linkedPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    type: 'post',
                    id: activity.id,
                    text: activity.text === '📷' ? null : activity.text, // Retorna null se for só emoji
                    date_creation: activity.date_creation,
                    author: {
                        id: activity.author?.id,
                        name: activity.author?.name,
                        avatar: activity.author?.avatar 
                            ? await getPresignedUrl(activity.author.avatar)
                            : null
                    },
                    serviceProject: serviceProject ? {
                        id: serviceProject.id,
                        name: serviceProject.name
                    } : null,
                    location: serviceProject?.Project ? {
                        address: serviceProject.Project.location,
                        coordinates: {
                            lat: serviceProject.Project.lat ? parseFloat(serviceProject.Project.lat) : null,
                            lng: serviceProject.Project.log ? parseFloat(serviceProject.Project.log) : null
                        }
                    } : null,
                    photos: photos,
                    likesCount: likesMap[activity.id] || 0,
                    commentsCount: commentsMap[activity.id] || 0
                });
            }

            // Processa fotos antigas que não têm activity vinculada (legado)
            const unlinkedPhotos = photosByActivityId['unlinked'] || [];
            const allUsedPhotoIds = new Set(
                posts.flatMap(post => post.photos.map((p: any) => p.id))
            );

            // Adiciona fotos antigas não vinculadas como posts separados (compatibilidade)
            for (const photo of unlinkedPhotos) {
                const serviceProject = serviceProjects.find(
                    sp => sp.id === photo.serviceProjectId
                );
                
                posts.push({
                    type: 'photo_only',
                    id: photo.id,
                    text: null,
                    date_creation: photo.date_creation,
                    author: null,
                    serviceProject: serviceProject ? {
                        id: serviceProject.id,
                        name: serviceProject.name
                    } : null,
                    location: serviceProject?.Project ? {
                        address: serviceProject.Project.location,
                        coordinates: {
                            lat: serviceProject.Project.lat ? parseFloat(serviceProject.Project.lat) : null,
                            lng: serviceProject.Project.log ? parseFloat(serviceProject.Project.log) : null
                        }
                    } : null,
                    photos: [{
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }]
                });
            }

            // Aplica filtro de hasPhotos
            let filteredPosts = posts;
            if (hasPhotos === 'true') {
                filteredPosts = posts.filter(post => post.photos && post.photos.length > 0);
            } else if (hasPhotos === 'false') {
                filteredPosts = posts.filter(post => !post.photos || post.photos.length === 0);
            }

            // Ordena os posts
            const orderMultiplier = order === 'asc' ? 1 : -1;
            
            filteredPosts.sort((a, b) => {
                if (sortBy === 'photos') {
                    // Ordena por quantidade de fotos
                    const aPhotos = a.photos?.length || 0;
                    const bPhotos = b.photos?.length || 0;
                    return (bPhotos - aPhotos) * orderMultiplier;
                } else {
                    // Ordena por data (padrão)
                    return (b.date_creation.getTime() - a.date_creation.getTime()) * orderMultiplier;
                }
            });

            // Aplica paginação melhorada
            const limitNum = parseInt(limit as string);
            const offsetNum = parseInt(offset as string);
            const totalPosts = filteredPosts.length;
            const totalPages = Math.ceil(totalPosts / limitNum);
            const currentPage = Math.floor(offsetNum / limitNum) + 1;
            const hasMore = offsetNum + limitNum < totalPosts;
            const nextOffset = hasMore ? offsetNum + limitNum : null;

            const paginatedPosts = filteredPosts.slice(offsetNum, offsetNum + limitNum);

            return response.status(200).json({
                success: true,
                data: {
                    posts: paginatedPosts,
                    pagination: {
                        total: totalPosts,
                        limit: limitNum,
                        offset: offsetNum,
                        currentPage: currentPage,
                        totalPages: totalPages,
                        hasMore: hasMore,
                        nextOffset: nextOffset
                    },
                    filters: {
                        serviceProjectId: serviceProjectId || null,
                        startDate: startDate || null,
                        endDate: endDate || null,
                        hasPhotos: hasPhotos || null,
                        authorId: authorId || null,
                        sortBy: sortBy,
                        order: order
                    }
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
     * Edita o texto de um post
     */
    async editPost(request: Request, response: Response) {
        try {
            const { postId } = request.params;
            const { text } = request.body;

            if (!text || !text.trim()) {
                return response.status(400).json({ 
                    error: 'Texto é obrigatório' 
                });
            }

            const activity = await prisma.activities.findUnique({
                where: { id: postId },
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

            if (!activity) {
                return response.status(404).json({ 
                    error: 'Post não encontrado' 
                });
            }

            const updatedActivity = await prisma.activities.update({
                where: { id: postId },
                data: {
                    text: text.trim()
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

            return response.status(200).json({ 
                success: true,
                data: {
                    id: updatedActivity.id,
                    text: updatedActivity.text,
                    date_creation: updatedActivity.date_creation,
                    date_update: updatedActivity.date_update,
                    author: {
                        id: updatedActivity.author?.id,
                        name: updatedActivity.author?.name,
                        avatar: updatedActivity.author?.avatar 
                            ? await getPresignedUrl(updatedActivity.author.avatar)
                            : null
                    }
                }
            });

        } catch (error) {
            console.error('Erro ao editar post:', error);
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
                    where: { id: postId },
                    select: { id: true }
                });

                if (!activity) {
                    return response.status(404).json({ 
                        error: 'Activity não encontrada' 
                    });
                }

                // Busca e deleta todas as fotos vinculadas a este post
                const linkedPhotos = await prisma.galleryAfter.findMany({
                    where: {
                        description: postId // Fotos vinculadas ao activity.id
                    }
                });

                // Deleta fotos do S3
                for (const photo of linkedPhotos) {
                    try {
                        await deleteFileFromS3(photo.url);
                    } catch (s3Error) {
                        console.error(`Erro ao deletar foto ${photo.id} do S3:`, s3Error);
                    }
                }

                // Deleta fotos do banco
                await prisma.galleryAfter.deleteMany({
                    where: {
                        description: postId
                    }
                });

                // Deleta a activity
                await prisma.activities.delete({
                    where: { id: postId }
                });

                return response.status(200).json({ 
                    success: true,
                    message: 'Post e fotos deletados com sucesso',
                    deletedPhotos: linkedPhotos.length
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
     * Deleta uma foto individual (nova função)
     */
    async deletePhoto(request: Request, response: Response) {
        try {
            const { photoId } = request.params;

            const photo = await prisma.galleryAfter.findUnique({
                where: { id: photoId },
                select: {
                    id: true,
                    url: true,
                    title: true,
                    description: true
                }
            });

            if (!photo) {
                return response.status(404).json({ 
                    error: 'Foto não encontrada' 
                });
            }

            // Verifica se é uma foto do feed
            if (photo.title !== 'FEED_POST') {
                return response.status(400).json({ 
                    error: 'Esta foto não pertence ao feed' 
                });
            }

            // Deleta do S3
            await deleteFileFromS3(photo.url);

            // Deleta do banco
            await prisma.galleryAfter.delete({
                where: { id: photoId }
            });

            return response.status(200).json({ 
                success: true,
                message: 'Foto deletada com sucesso',
                activityId: photo.description // Retorna o ID do post para atualizar no frontend
            });

        } catch (error) {
            console.error('Erro ao deletar foto:', error);
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

            // Agrupa fotos por activity.id (armazenado no campo description)
            const photosByActivityId = feedPhotos.reduce((acc, photo) => {
                const activityId = photo.description || 'unlinked';
                if (!acc[activityId]) {
                    acc[activityId] = [];
                }
                acc[activityId].push(photo);
                return acc;
            }, {} as Record<string, typeof feedPhotos>);

            const posts = [];

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

            // Processa activities
            for (const activity of activities) {
                // Busca fotos vinculadas diretamente a este post (pelo activity.id)
                const linkedPhotos = photosByActivityId[activity.id] || [];
                
                const photos = await Promise.all(
                    linkedPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    type: 'post',
                    id: activity.id,
                    text: activity.text === '📷' ? null : activity.text, // Retorna null se for só emoji
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
                    photos: photos,
                    likesCount: likesMap[activity.id] || 0,
                    commentsCount: commentsMap[activity.id] || 0
                });
            }

            // Processa fotos antigas que não têm activity vinculada (compatibilidade com dados antigos)
            const unlinkedPhotos = photosByActivityId['unlinked'] || [];
            
            for (const photo of unlinkedPhotos) {
                posts.push({
                    type: 'photo_only',
                    id: photo.id,
                    text: null,
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

            // Agrupa fotos por activity.id (armazenado no campo description)
            const photosByActivityId = feedPhotos.reduce((acc, photo) => {
                const activityId = photo.description || 'unlinked';
                if (!acc[activityId]) {
                    acc[activityId] = [];
                }
                acc[activityId].push(photo);
                return acc;
            }, {} as Record<string, typeof feedPhotos>);

            // Cria posts combinados
            const posts = [];

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

            // Processa activities
            for (const activity of activities) {
                // Busca fotos vinculadas diretamente a este post (pelo activity.id)
                const linkedPhotos = photosByActivityId[activity.id] || [];
                
                const photos = await Promise.all(
                    linkedPhotos.map(async (photo) => ({
                        id: photo.id,
                        url: await getPresignedUrl(photo.url),
                        date_creation: photo.date_creation
                    }))
                );

                posts.push({
                    type: 'post',
                    id: activity.id,
                    text: activity.text === '📷' ? null : activity.text, // Retorna null se for só emoji
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
                    photos: photos,
                    likesCount: likesMap[activity.id] || 0,
                    commentsCount: commentsMap[activity.id] || 0
                });
            }

            // Processa fotos antigas que não têm activity vinculada (compatibilidade com dados antigos)
            const unlinkedPhotos = photosByActivityId['unlinked'] || [];
            
            for (const photo of unlinkedPhotos) {
                posts.push({
                    type: 'photo_only',
                    id: photo.id,
                    text: null,
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
                            postsCount: 0,
                            photosCount: 0
                        };
                    }
                    acc[projectId].postsCount++;
                    acc[projectId].photosCount += post.photos.length;
                }
                return acc;
            }, {} as Record<string, any>);

            // Calcula estatísticas temporais
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const postsThisWeek = posts.filter(p => 
                p.date_creation.getTime() >= oneWeekAgo.getTime()
            ).length;
            
            const postsThisMonth = posts.filter(p => 
                p.date_creation.getTime() >= oneMonthAgo.getTime()
            ).length;

            const totalPhotos = posts.reduce((sum, post) => sum + post.photos.length, 0);
            const averagePhotosPerPost = posts.length > 0 ? (totalPhotos / posts.length).toFixed(2) : 0;

            // Posts com mais fotos
            const postsWithPhotos = posts.filter(p => p.photos.length > 0);
            const topPostsByPhotos = [...posts]
                .sort((a, b) => b.photos.length - a.photos.length)
                .slice(0, 5)
                .map(p => ({
                    id: p.id,
                    text: p.text,
                    photosCount: p.photos.length,
                    date_creation: p.date_creation,
                    project: p.project
                }));

            // Projeto mais ativo
            const mostActiveProject = Object.values(projectStats)
                .sort((a: any, b: any) => b.postsCount - a.postsCount)[0] || null;

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
                        overview: {
                            totalPosts: posts.length,
                            totalPhotos: totalPhotos,
                            postsWithPhotos: postsWithPhotos.length,
                            postsWithoutPhotos: posts.length - postsWithPhotos.length,
                            averagePhotosPerPost: parseFloat(averagePhotosPerPost as string)
                        },
                        temporal: {
                            postsThisWeek: postsThisWeek,
                            postsThisMonth: postsThisMonth,
                            averagePostsPerDay: posts.length > 0 ? (postsThisMonth / 30).toFixed(2) : 0
                        },
                        projects: {
                            projectsCount: Object.keys(projectStats).length,
                            mostActiveProject: mostActiveProject,
                            allProjects: Object.values(projectStats)
                        },
                        topPosts: {
                            byPhotos: topPostsByPhotos
                        }
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

    // ==================== COMENTÁRIOS ====================

    /**
     * Criar comentário em um post
     */
    async createComment(request: Request, response: Response) {
        try {
            const { postId } = request.params;
            const { text, userId } = request.body;

            if (!text || !text.trim()) {
                return response.status(400).json({ 
                    error: 'Texto do comentário é obrigatório' 
                });
            }

            if (!userId) {
                return response.status(400).json({ 
                    error: 'userId é obrigatório' 
                });
            }

            // Verifica se o post existe
            const activity = await prisma.activities.findUnique({
                where: { id: postId },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });

            if (!activity) {
                return response.status(404).json({ 
                    error: 'Post não encontrado' 
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

            // Cria o comentário
            const comment = await prisma.feedComment.create({
                data: {
                    text: text.trim(),
                    activityId: postId,
                    authorId: userId
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

            // Cria notificação para o autor do post (se não for ele mesmo comentando)
            if (activity.authorId && activity.authorId !== userId) {
                await prisma.feedNotification.create({
                    data: {
                        type: 'comment',
                        message: `${user.name} comentou no seu post`,
                        userId: activity.authorId,
                        actorId: userId,
                        activityId: postId,
                        relatedLink: `/feed/${postId}`
                    }
                });
            }

            return response.status(201).json({
                success: true,
                data: {
                    id: comment.id,
                    text: comment.text,
                    date_creation: comment.date_creation,
                    author: {
                        id: comment.author.id,
                        name: comment.author.name,
                        avatar: comment.author.avatar 
                            ? await getPresignedUrl(comment.author.avatar)
                            : null
                    }
                }
            });

        } catch (error) {
            console.error('Erro ao criar comentário:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Listar comentários de um post
     */
    async getComments(request: Request, response: Response) {
        try {
            const { postId } = request.params;

            const comments = await prisma.feedComment.findMany({
                where: {
                    activityId: postId
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
                    date_creation: 'asc' // Mais antigos primeiro
                }
            });

            const commentsWithUrls = await Promise.all(
                comments.map(async (comment) => ({
                    id: comment.id,
                    text: comment.text,
                    date_creation: comment.date_creation,
                    date_update: comment.date_update,
                    author: {
                        id: comment.author.id,
                        name: comment.author.name,
                        avatar: comment.author.avatar 
                            ? await getPresignedUrl(comment.author.avatar)
                            : null
                    }
                }))
            );

            return response.status(200).json({
                success: true,
                data: {
                    comments: commentsWithUrls,
                    total: commentsWithUrls.length
                }
            });

        } catch (error) {
            console.error('Erro ao buscar comentários:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Deletar comentário
     */
    async deleteComment(request: Request, response: Response) {
        try {
            const { commentId } = request.params;
            const { userId } = request.body; // Para verificar se é o autor

            const comment = await prisma.feedComment.findUnique({
                where: { id: commentId },
                select: {
                    authorId: true
                }
            });

            if (!comment) {
                return response.status(404).json({ 
                    error: 'Comentário não encontrado' 
                });
            }

            // Verifica se é o autor do comentário
            if (userId && comment.authorId !== userId) {
                return response.status(403).json({ 
                    error: 'Você não tem permissão para deletar este comentário' 
                });
            }

            await prisma.feedComment.delete({
                where: { id: commentId }
            });

            return response.status(200).json({
                success: true,
                message: 'Comentário deletado com sucesso'
            });

        } catch (error) {
            console.error('Erro ao deletar comentário:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    // ==================== LIKES ====================

    /**
     * Dar like em um post
     */
    async likePost(request: Request, response: Response) {
        try {
            const { postId } = request.params;
            const { userId } = request.body;

            if (!userId) {
                return response.status(400).json({ 
                    error: 'userId é obrigatório' 
                });
            }

            // Verifica se o post existe
            const activity = await prisma.activities.findUnique({
                where: { id: postId },
                select: {
                    id: true,
                    authorId: true
                }
            });

            if (!activity) {
                return response.status(404).json({ 
                    error: 'Post não encontrado' 
                });
            }

            // Verifica se já deu like
            const existingLike = await prisma.feedLike.findUnique({
                where: {
                    activityId_userId: {
                        activityId: postId,
                        userId: userId
                    }
                }
            });

            if (existingLike) {
                return response.status(400).json({ 
                    error: 'Você já curtiu este post' 
                });
            }

            // Cria o like
            const like = await prisma.feedLike.create({
                data: {
                    activityId: postId,
                    userId: userId
                }
            });

            // Busca informações do usuário para notificação
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    name: true
                }
            });

            // Cria notificação para o autor do post (se não for ele mesmo curtindo)
            if (activity.authorId && activity.authorId !== userId) {
                await prisma.feedNotification.create({
                    data: {
                        type: 'like',
                        message: `${user?.name || 'Alguém'} curtiu seu post`,
                        userId: activity.authorId,
                        actorId: userId,
                        activityId: postId,
                        relatedLink: `/feed/${postId}`
                    }
                });
            }

            // Conta total de likes
            const totalLikes = await prisma.feedLike.count({
                where: {
                    activityId: postId
                }
            });

            return response.status(201).json({
                success: true,
                data: {
                    likeId: like.id,
                    totalLikes: totalLikes
                }
            });

        } catch (error) {
            console.error('Erro ao dar like:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Remover like de um post
     */
    async unlikePost(request: Request, response: Response) {
        try {
            const { postId } = request.params;
            const { userId } = request.body;

            if (!userId) {
                return response.status(400).json({ 
                    error: 'userId é obrigatório' 
                });
            }

            const like = await prisma.feedLike.findUnique({
                where: {
                    activityId_userId: {
                        activityId: postId,
                        userId: userId
                    }
                }
            });

            if (!like) {
                return response.status(404).json({ 
                    error: 'Like não encontrado' 
                });
            }

            await prisma.feedLike.delete({
                where: {
                    id: like.id
                }
            });

            // Conta total de likes
            const totalLikes = await prisma.feedLike.count({
                where: {
                    activityId: postId
                }
            });

            return response.status(200).json({
                success: true,
                message: 'Like removido com sucesso',
                data: {
                    totalLikes: totalLikes
                }
            });

        } catch (error) {
            console.error('Erro ao remover like:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Listar likes de um post
     */
    async getLikes(request: Request, response: Response) {
        try {
            const { postId } = request.params;

            const likes = await prisma.feedLike.findMany({
                where: {
                    activityId: postId
                },
                include: {
                    user: {
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

            const likesWithUrls = await Promise.all(
                likes.map(async (like) => ({
                    id: like.id,
                    date_creation: like.date_creation,
                    user: {
                        id: like.user.id,
                        name: like.user.name,
                        avatar: like.user.avatar 
                            ? await getPresignedUrl(like.user.avatar)
                            : null
                    }
                }))
            );

            return response.status(200).json({
                success: true,
                data: {
                    likes: likesWithUrls,
                    total: likesWithUrls.length
                }
            });

        } catch (error) {
            console.error('Erro ao buscar likes:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    // ==================== NOTIFICAÇÕES ====================

    /**
     * Listar notificações de um usuário
     */
    async getNotifications(request: Request, response: Response) {
        try {
            const { userId } = request.params;
            const { unreadOnly = 'false', limit = '50', offset = '0' } = request.query;

            const whereClause: any = {
                userId: userId
            };

            if (unreadOnly === 'true') {
                whereClause.isRead = false;
            }

            const notifications = await prisma.feedNotification.findMany({
                where: whereClause,
                include: {
                    actor: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true
                        }
                    },
                    activity: {
                        select: {
                            id: true,
                            text: true
                        }
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                },
                take: parseInt(limit as string),
                skip: parseInt(offset as string)
            });

            const notificationsWithUrls = await Promise.all(
                notifications.map(async (notification) => ({
                    id: notification.id,
                    type: notification.type,
                    message: notification.message,
                    isRead: notification.isRead,
                    relatedLink: notification.relatedLink,
                    date_creation: notification.date_creation,
                    actor: notification.actor ? {
                        id: notification.actor.id,
                        name: notification.actor.name,
                        avatar: notification.actor.avatar 
                            ? await getPresignedUrl(notification.actor.avatar)
                            : null
                    } : null,
                    activity: notification.activity ? {
                        id: notification.activity.id,
                        text: notification.activity.text
                    } : null
                }))
            );

            // Conta notificações não lidas
            const unreadCount = await prisma.feedNotification.count({
                where: {
                    userId: userId,
                    isRead: false
                }
            });

            return response.status(200).json({
                success: true,
                data: {
                    notifications: notificationsWithUrls,
                    total: notificationsWithUrls.length,
                    unreadCount: unreadCount
                }
            });

        } catch (error) {
            console.error('Erro ao buscar notificações:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Marcar notificação como lida
     */
    async markNotificationAsRead(request: Request, response: Response) {
        try {
            const { notificationId } = request.params;

            await prisma.feedNotification.update({
                where: { id: notificationId },
                data: {
                    isRead: true
                }
            });

            return response.status(200).json({
                success: true,
                message: 'Notificação marcada como lida'
            });

        } catch (error) {
            console.error('Erro ao marcar notificação:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }

    /**
     * Marcar todas notificações como lidas
     */
    async markAllNotificationsAsRead(request: Request, response: Response) {
        try {
            const { userId } = request.params;

            await prisma.feedNotification.updateMany({
                where: {
                    userId: userId,
                    isRead: false
                },
                data: {
                    isRead: true
                }
            });

            return response.status(200).json({
                success: true,
                message: 'Todas notificações marcadas como lidas'
            });

        } catch (error) {
            console.error('Erro ao marcar todas notificações:', error);
            return response.status(500).json({ 
                error: 'Erro interno do servidor',
                details: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
    }
}

