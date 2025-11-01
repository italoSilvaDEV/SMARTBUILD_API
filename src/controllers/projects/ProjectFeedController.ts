import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import multer from "multer";
import { uploadFileToS3 } from "../../utils/S3/uploadFIleS3";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const upload = multer({ 
    dest: './tmp/project-feed',
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max
    }
}).array('files', 10); // Max 10 arquivos por vez

export class ProjectFeedController {
    /**
     * Criar um novo post no feed do projeto
     * POST /api/projects/:projectId/feed
     */
    async create(request: Request, response: Response) {
        upload(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ error: 'Erro ao fazer upload dos arquivos' });
            }

            try {
                const { projectId } = request.params;
                const {
                    type,
                    title,
                    description,
                    isPublic,
                    authorId
                } = request.body;

                const files = request.files as Express.Multer.File[];

                // Validações
                if (!projectId || !type || !authorId) {
                    return response.status(400).json({
                        error: 'projectId, type e authorId são obrigatórios'
                    });
                }

                // Verificar se o projeto existe
                const project = await prisma.project.findUnique({
                    where: { id: projectId }
                });

                if (!project) {
                    return response.status(404).json({ error: 'Projeto não encontrado' });
                }

                // Verificar se o usuário existe
                const user = await prisma.user.findUnique({
                    where: { id: authorId }
                });

                if (!user) {
                    return response.status(404).json({ error: 'Usuário não encontrado' });
                }

                // Criar o post no feed
                const feedPost = await prisma.projectFeed.create({
                    data: {
                        type,
                        title,
                        description,
                        isPublic: isPublic === 'true' || isPublic === true,
                        projectId,
                        authorId,
                    },
                    include: {
                        author: {
                            select: {
                                id: true,
                                name: true,
                                avatar: true,
                            }
                        }
                    }
                });

                // Processar e fazer upload dos arquivos (fotos/vídeos)
                const mediaRecords = [];
                if (files && files.length > 0) {
                    for (const file of files) {
                        try {
                            let thumbnailUrl = null;
                            let width = null;
                            let height = null;
                            let duration = null;

                            // Determinar o tipo de mídia
                            const isVideo = file.mimetype.startsWith('video/');
                            const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

                            // Se for imagem, obter dimensões e criar thumbnail
                            if (!isVideo) {
                                const metadata = await sharp(file.path).metadata();
                                width = metadata.width || null;
                                height = metadata.height || null;

                                // Criar thumbnail
                                const thumbnailPath = `${file.path}-thumb.jpg`;
                                await sharp(file.path)
                                    .resize(400, 400, { fit: 'inside' })
                                    .jpeg({ quality: 80 })
                                    .toFile(thumbnailPath);

                                // Upload thumbnail
                                const thumbnailFile = {
                                    path: thumbnailPath,
                                    originalname: `thumb-${file.originalname}`,
                                    mimetype: 'image/jpeg'
                                } as Express.Multer.File;

                                thumbnailUrl = await uploadFileToS3(thumbnailFile, 'project-feed/thumbnails');
                                
                                // Deletar arquivo local da thumbnail
                                fs.unlinkSync(thumbnailPath);
                            }

                            // Upload do arquivo original
                            const fileUrl = await uploadFileToS3(file, 'project-feed');

                            // Criar registro de mídia
                            const media = await prisma.projectMedia.create({
                                data: {
                                    url: fileUrl,
                                    thumbnailUrl,
                                    type: mediaType,
                                    fileSize: file.size,
                                    duration,
                                    width,
                                    height,
                                    originalFileName: file.originalname,
                                    mimeType: file.mimetype,
                                    projectFeedId: feedPost.id,
                                }
                            });

                            mediaRecords.push(media);

                            // Deletar arquivo local
                            fs.unlinkSync(file.path);
                        } catch (uploadError) {
                            console.error('Erro ao processar arquivo:', uploadError);
                            // Continuar com os próximos arquivos
                        }
                    }
                }

                // Buscar o post completo com as mídias
                const completeFeedPost = await prisma.projectFeed.findUnique({
                    where: { id: feedPost.id },
                    include: {
                        author: {
                            select: {
                                id: true,
                                name: true,
                                avatar: true,
                            }
                        },
                        media: true,
                        comments: {
                            include: {
                                author: {
                                    select: {
                                        id: true,
                                        name: true,
                                        avatar: true,
                                    }
                                }
                            },
                            orderBy: {
                                date_creation: 'desc'
                            }
                        },
                        reactions: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                    }
                                }
                            }
                        }
                    }
                });

                return response.status(201).json(completeFeedPost);

            } catch (error) {
                console.error('Erro ao criar post no feed:', error);
                return response.status(500).json({ error: 'Erro ao criar post no feed' });
            }
        });
    }

    /**
     * Listar feed de um projeto
     * GET /api/projects/:projectId/feed
     */
    async list(request: Request, response: Response) {
        try {
            const { projectId } = request.params;
            const { page = '1', limit = '20', type } = request.query;

            const pageNum = parseInt(page as string);
            const limitNum = parseInt(limit as string);
            const skip = (pageNum - 1) * limitNum;

            // Construir filtros
            const where: any = { projectId };
            if (type) {
                where.type = type;
            }

            // Buscar posts
            const [feedPosts, total] = await Promise.all([
                prisma.projectFeed.findMany({
                    where,
                    skip,
                    take: limitNum,
                    include: {
                        author: {
                            select: {
                                id: true,
                                name: true,
                                avatar: true,
                            }
                        },
                        media: true,
                        comments: {
                            include: {
                                author: {
                                    select: {
                                        id: true,
                                        name: true,
                                        avatar: true,
                                    }
                                }
                            },
                            orderBy: {
                                date_creation: 'desc'
                            },
                            take: 3 // Apenas os 3 primeiros comentários
                        },
                        reactions: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                    }
                                }
                            }
                        },
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
                }),
                prisma.projectFeed.count({ where })
            ]);

            return response.json({
                data: feedPosts,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum)
                }
            });

        } catch (error) {
            console.error('Erro ao listar feed:', error);
            return response.status(500).json({ error: 'Erro ao listar feed' });
        }
    }

    /**
     * Buscar um post específico do feed
     * GET /api/projects/feed/:feedId
     */
    async show(request: Request, response: Response) {
        try {
            const { feedId } = request.params;

            const feedPost = await prisma.projectFeed.findUnique({
                where: { id: feedId },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                        }
                    },
                    media: true,
                    comments: {
                        include: {
                            author: {
                                select: {
                                    id: true,
                                    name: true,
                                    avatar: true,
                                }
                            }
                        },
                        orderBy: {
                            date_creation: 'desc'
                        }
                    },
                    reactions: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                }
                            }
                        }
                    },
                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            client: {
                                select: {
                                    id: true,
                                    name: true,
                                }
                            }
                        }
                    }
                }
            });

            if (!feedPost) {
                return response.status(404).json({ error: 'Post não encontrado' });
            }

            // Incrementar visualizações
            await prisma.projectFeed.update({
                where: { id: feedId },
                data: {
                    viewCount: {
                        increment: 1
                    }
                }
            });

            return response.json(feedPost);

        } catch (error) {
            console.error('Erro ao buscar post:', error);
            return response.status(500).json({ error: 'Erro ao buscar post' });
        }
    }

    /**
     * Atualizar um post do feed
     * PUT /api/projects/feed/:feedId
     */
    async update(request: Request, response: Response) {
        try {
            const { feedId } = request.params;
            const { title, description, isPublic } = request.body;

            const feedPost = await prisma.projectFeed.findUnique({
                where: { id: feedId }
            });

            if (!feedPost) {
                return response.status(404).json({ error: 'Post não encontrado' });
            }

            const updatedPost = await prisma.projectFeed.update({
                where: { id: feedId },
                data: {
                    title: title !== undefined ? title : feedPost.title,
                    description: description !== undefined ? description : feedPost.description,
                    isPublic: isPublic !== undefined ? isPublic : feedPost.isPublic,
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                        }
                    },
                    media: true,
                }
            });

            return response.json(updatedPost);

        } catch (error) {
            console.error('Erro ao atualizar post:', error);
            return response.status(500).json({ error: 'Erro ao atualizar post' });
        }
    }

    /**
     * Deletar um post do feed
     * DELETE /api/projects/feed/:feedId
     */
    async delete(request: Request, response: Response) {
        try {
            const { feedId } = request.params;

            const feedPost = await prisma.projectFeed.findUnique({
                where: { id: feedId },
                include: {
                    media: true
                }
            });

            if (!feedPost) {
                return response.status(404).json({ error: 'Post não encontrado' });
            }

            // Deletar arquivos do S3
            for (const media of feedPost.media) {
                try {
                    // Extrair o key do S3 da URL
                    const urlParts = media.url.split('.com/');
                    if (urlParts.length > 1) {
                        await deleteFileFromS3(urlParts[1]);
                    }

                    if (media.thumbnailUrl) {
                        const thumbUrlParts = media.thumbnailUrl.split('.com/');
                        if (thumbUrlParts.length > 1) {
                            await deleteFileFromS3(thumbUrlParts[1]);
                        }
                    }
                } catch (deleteError) {
                    console.error('Erro ao deletar arquivo do S3:', deleteError);
                }
            }

            // Deletar o post (cascade vai deletar mídia, comentários e reações)
            await prisma.projectFeed.delete({
                where: { id: feedId }
            });

            return response.json({ message: 'Post deletado com sucesso' });

        } catch (error) {
            console.error('Erro ao deletar post:', error);
            return response.status(500).json({ error: 'Erro ao deletar post' });
        }
    }

    /**
     * Adicionar comentário a um post
     * POST /api/projects/feed/:feedId/comments
     */
    async addComment(request: Request, response: Response) {
        try {
            const { feedId } = request.params;
            const { text, authorId } = request.body;

            if (!text || !authorId) {
                return response.status(400).json({ error: 'text e authorId são obrigatórios' });
            }

            const feedPost = await prisma.projectFeed.findUnique({
                where: { id: feedId }
            });

            if (!feedPost) {
                return response.status(404).json({ error: 'Post não encontrado' });
            }

            const comment = await prisma.projectFeedComment.create({
                data: {
                    text,
                    projectFeedId: feedId,
                    authorId,
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                        }
                    }
                }
            });

            return response.status(201).json(comment);

        } catch (error) {
            console.error('Erro ao adicionar comentário:', error);
            return response.status(500).json({ error: 'Erro ao adicionar comentário' });
        }
    }

    /**
     * Deletar comentário
     * DELETE /api/projects/feed/comments/:commentId
     */
    async deleteComment(request: Request, response: Response) {
        try {
            const { commentId } = request.params;

            await prisma.projectFeedComment.delete({
                where: { id: commentId }
            });

            return response.json({ message: 'Comentário deletado com sucesso' });

        } catch (error) {
            console.error('Erro ao deletar comentário:', error);
            return response.status(500).json({ error: 'Erro ao deletar comentário' });
        }
    }

    /**
     * Adicionar/remover reação a um post
     * POST /api/projects/feed/:feedId/reactions
     */
    async toggleReaction(request: Request, response: Response) {
        try {
            const { feedId } = request.params;
            const { emoji, userId } = request.body;

            if (!emoji || !userId) {
                return response.status(400).json({ error: 'emoji e userId são obrigatórios' });
            }

            // Verificar se a reação já existe
            const existingReaction = await prisma.projectFeedReaction.findUnique({
                where: {
                    projectFeedId_userId_emoji: {
                        projectFeedId: feedId,
                        userId,
                        emoji
                    }
                }
            });

            if (existingReaction) {
                // Remover reação
                await prisma.projectFeedReaction.delete({
                    where: { id: existingReaction.id }
                });

                return response.json({ message: 'Reação removida', action: 'removed' });
            } else {
                // Adicionar reação
                const reaction = await prisma.projectFeedReaction.create({
                    data: {
                        emoji,
                        projectFeedId: feedId,
                        userId,
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                });

                return response.status(201).json({ message: 'Reação adicionada', action: 'added', reaction });
            }

        } catch (error) {
            console.error('Erro ao gerenciar reação:', error);
            return response.status(500).json({ error: 'Erro ao gerenciar reação' });
        }
    }

    /**
     * Obter estatísticas do feed de um projeto
     * GET /api/projects/:projectId/feed/stats
     */
    async getStats(request: Request, response: Response) {
        try {
            const { projectId } = request.params;

            const [
                totalPosts,
                totalPhotos,
                totalVideos,
                totalComments,
                totalReactions,
                recentPosts
            ] = await Promise.all([
                prisma.projectFeed.count({ where: { projectId } }),
                prisma.projectFeed.count({ where: { projectId, type: 'PHOTO' } }),
                prisma.projectFeed.count({ where: { projectId, type: 'VIDEO' } }),
                prisma.projectFeedComment.count({
                    where: {
                        projectFeed: { projectId }
                    }
                }),
                prisma.projectFeedReaction.count({
                    where: {
                        projectFeed: { projectId }
                    }
                }),
                prisma.projectFeed.findMany({
                    where: { projectId },
                    take: 5,
                    orderBy: { date_creation: 'desc' },
                    select: {
                        id: true,
                        type: true,
                        date_creation: true,
                    }
                })
            ]);

            return response.json({
                totalPosts,
                totalPhotos,
                totalVideos,
                totalComments,
                totalReactions,
                recentPosts
            });

        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            return response.status(500).json({ error: 'Erro ao buscar estatísticas' });
        }
    }
}

