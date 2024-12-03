import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class ProjectStageController {
    static async create(req: Request, res: Response) {
        try {
            const { description, check, id_user_update, projectId } = req.body;

            if (!description || typeof description !== "string") {
                return res.status(400).json({ message: "Invalid or missing 'description'" });
            }

            if (typeof check !== "boolean") {
                return res.status(400).json({ message: "Invalid or missing 'check' (must be a boolean)" });
            }

            if (!id_user_update || typeof id_user_update !== "string") {
                return res.status(400).json({ message: "Invalid or missing 'id_user_update'" });
            }

            if (!projectId || typeof projectId !== "string") {
                return res.status(400).json({ message: "Invalid or missing 'projectId'" });
            }

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

            if (!id || typeof id !== "string") {
                return res.status(400).json({ message: "Invalid or missing 'id'" });
            }

            const projectStage = await prisma.projectStages.findMany({
                where: { projectId: id },
            });

            if (!projectStage || projectStage.length === 0) {
                return res.status(404).json({ message: "Project stages not found for the given 'id'" });
            }

            res.json(projectStage);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching project stage" });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { description, check, id_user_update } = req.body;

            if (!id || typeof id !== "string") {
                return res.status(400).json({ message: "Invalid or missing 'id'" });
            }

            if (description && typeof description !== "string") {
                return res.status(400).json({ message: "Invalid 'description'" });
            }

            if (check !== undefined && typeof check !== "boolean") {
                return res.status(400).json({ message: "Invalid 'check' (must be a boolean)" });
            }

            if (id_user_update && typeof id_user_update !== "string") {
                return res.status(400).json({ message: "Invalid 'id_user_update'" });
            }

            const projectStage = await prisma.projectStages.update({
                where: { id },
                data: {
                    description,
                    check,
                    id_user_update,
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

            if (!id || typeof id !== "string") {
                return res.status(400).json({ message: "Invalid or missing 'id'" });
            }

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
