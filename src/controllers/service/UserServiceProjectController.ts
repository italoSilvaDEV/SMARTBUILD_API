import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UserServiceProjectController {
    // Criar um novo UserServiceProject
   
    async create(req: Request, res: Response) {
        try {
            const { user_ids, service_project_id, assigned_at } = req.body;

            // Verifica se o projeto existe
            const serviceProjectExists = await prisma.serviceProject.findUnique({
                where: { id: service_project_id },
            });

            if (!serviceProjectExists) {
                return res.status(400).json({ error: 'Service project not found.' });
            }

            // Verifica se todos os usuários existem
            const usersExist = await prisma.user.findMany({
                where: { id: { in: user_ids } },
                select: { id: true },
            });

            const existingUserIds = usersExist.map((user) => user.id);

            const invalidUserIds = user_ids.filter((id: string) => !existingUserIds.includes(id));

            if (invalidUserIds.length > 0) {
                return res.status(400).json({
                    error: 'Some users were not found.',
                    invalidUserIds,
                });
            }

            // Remove relações com usuários não listados
            await prisma.userServiceProject.deleteMany({
                where: {
                    service_project_id,
                    user_id: { notIn: user_ids },
                },
            });

            // Obtém relações já existentes
            const existingRelations = await prisma.userServiceProject.findMany({
                where: {
                    service_project_id,
                    user_id: { in: user_ids },
                },
                select: { user_id: true },
            });

            const associatedUserIds = existingRelations.map((relation) => relation.user_id);

            // Filtra IDs que não estão associados
            const newUserIds = user_ids.filter((id: string) => !associatedUserIds.includes(id));

            // Cria novas relações
            const newRelations = await prisma.userServiceProject.createMany({
                data: newUserIds.map((user_id: string) => ({
                    user_id,
                    service_project_id,
                    assigned_at: assigned_at || new Date(),
                })),
            });

            res.status(201).json({
                message: `${newRelations.count} users successfully added to the project.`,
                addedUserIds: newUserIds,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error while creating relationships.' });
        }
    }
   
    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const userServiceProject = await prisma.userServiceProject.findMany({
                where: { service_project_id: {equals: id} },
                include: {
                    user: {
                        select: {
                            id: true,
                            avatar: true,
                            name: true,                            
                        }
                    },
                },
            });

            res.status(200).json(userServiceProject);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Mistake when looking for a relationship' });
        }
    }  

    async getByUser(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const userServiceProject = await prisma.userServiceProject.findMany({
                where: { user_id: { equals: id } },
                include: {
                   service_project: true
                },
            });

            res.status(200).json(userServiceProject);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error when searching for services' });
        }
    }
}

