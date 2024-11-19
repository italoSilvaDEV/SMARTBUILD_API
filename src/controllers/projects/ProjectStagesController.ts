import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class ProjectStageController {
    static async create(req: Request, res: Response) {
        try {
            const { description, check, id_user_update, projectId } = req.body;

            const projectStage = await prisma.projectStages.create({
                data: {
                    description,
                    check,
                    id_user_update,
                    projectId,
                },
            });

            res.status(201).json(projectStage);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error creating project stage" });
        }
    }

    static async findById(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const projectStage = await prisma.projectStages.findUnique({
                where: { id },
            });

            if (!projectStage) {
                return res.status(404).json({ message: "Project stage not found" });
            }

            res.json(projectStage);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching project stage" });
        }
    }

    static async findAll(req: Request, res: Response) {
        try {
            const projectStages = await prisma.projectStages.findMany();
            res.json(projectStages);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching project stages" });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { description, check, id_user_update, projectId } = req.body;

            const projectStage = await prisma.projectStages.update({
                where: { id },
                data: {
                    description,
                    check,
                    id_user_update,
                    projectId,
                },
            });

            res.json(projectStage);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error updating project stage" });
        }
    }

    static async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;

            await prisma.projectStages.delete({
                where: { id },
            });

            res.status(204).send();
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error deleting project stage" });
        }
    }
}
