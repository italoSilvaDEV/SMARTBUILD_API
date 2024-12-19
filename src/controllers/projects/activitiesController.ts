import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

// Listar todas as atividades
export const listActivities = async (req: Request, res: Response): Promise<void> => {
    const { serviceProjectId } = req.params
    try {
        const activities = await prisma.activities.findMany({
            where: {
                serviceProjectId
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                },
            },
            orderBy: {
                date_creation: "desc"
            }
        });
        res.status(200).json(activities);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch activities" });
    }
};

// Cadastrar uma nova atividade
export const createActivity = async (req: Request, res: Response): Promise<void> => {
    const { text, serviceProjectId, authorId } = req.body;
    try {
        const activity = await prisma.activities.create({
            data: {
                text,
                serviceProjectId,
                authorId,
            },
        });
        res.status(201).json(activity);
    } catch (error) {
        res.status(500).json({ error: "Failed to create activity" });
    }
};

// Excluir uma atividade
export const deleteActivity = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
        await prisma.activities.delete({
            where: { id },
        });
        res.status(200).json({ message: "Activity deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete activity" });
    }
};
