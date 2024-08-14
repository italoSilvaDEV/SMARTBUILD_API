import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateCostProjectController {
    async handle(req: Request, res: Response) {
        try {
            let costProjects = req.body;

            if (!Array.isArray(costProjects)) {
                costProjects = [costProjects];
            }

            const error: string[] = [];
            for (const project of costProjects) {
                const {
                    material_name,
                    price,
                    amout,
                    userId,
                    serviceProjectId,
                    invoice_cost_project_id
                } = project;

                if (!material_name) {
                    error.push("Material name is required!");
                    continue;
                }
                if (!price || parseFloat(price) <= 0) {
                    error.push("Price is mandatory and must be greater than zero!");
                    continue;
                }
                if (!amout || parseInt(amout) <= 0) {
                    error.push("Amout is mandatory and must be greater than zero");
                    continue;
                }

                const user = await prisma.user.findUnique({
                    where: { id: userId }
                });

              
                const serviceProject = await prisma.serviceProject.findUnique({
                    where: { id: serviceProjectId }
                });

                if (!user) {
                    error.push("User linked to invalid project!");
                    continue;
                }

                

                if (!serviceProject) {
                    error.push("Service project linked to invalid project!");
                    continue;
                }

                if (!invoice_cost_project_id) {
                    error.push("Invoice cost project is invalid!");
                    continue;
                }

                await prisma.costProject.create({
                    data: {
                        material_name,
                        price: parseFloat(price),
                        amout: parseInt(amout),
                        userId: userId ?? '',
                        serviceProjectId,
                        invoice_cost_project_id: invoice_cost_project_id
                    },
                });
            }

            if (error.length > 0) {
                return res.status(400).json({ error });
            }

            return res.status(201).json({ message: "Cost projects created successfully" });

        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal error" });
        }
    }
}
