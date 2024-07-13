import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateCostProjectController {
    async handle(req: Request, res: Response) {
        try {
            let costProjects = req.body;

            if (!Array.isArray(costProjects)) {
                costProjects = [costProjects];
            }

            const errors: string[] = [];
            for (const project of costProjects) {
                const {
                    material_name,
                    price,
                    amout,
                    userId,
                    workedhoursId,
                    serviceProjectId,
                    invoice_cost_project_id
                } = project;

                if (!material_name) {
                    errors.push("Material name is required!");
                    continue;
                }
                if (!price || parseFloat(price) <= 0) {
                    errors.push("Price is mandatory and must be greater than zero!");
                    continue;
                }
                if (!amout || parseInt(amout) <= 0) {
                    errors.push("Amout is mandatory and must be greater than zero");
                    continue;
                }
                if (!userId || !workedhoursId || !invoice_cost_project_id || !serviceProjectId) {
                    errors.push("User ID, worked hours ID, invoice ID, and service project ID are required");
                    continue;
                }

                const user = await prisma.user.findUnique({
                    where: { id: userId }
                });

                const service = await prisma.workedhours.findUnique({
                    where: { id: workedhoursId }
                });

                const serviceProject = await prisma.serviceProject.findUnique({
                    where: { id: serviceProjectId }
                });

                if (!user) {
                    errors.push("User linked to invalid project!");
                    continue;
                }

                if (!service) {
                    errors.push("Service linked to invalid project!");
                    continue;
                }

                if (!serviceProject) {
                    errors.push("Service project linked to invalid project!");
                    continue;
                }

                if (!invoice_cost_project_id) {
                    errors.push("Invoice cost project is invalid!");
                    continue;
                }

                await prisma.costProject.create({
                    data: {
                        material_name,
                        price: parseFloat(price),
                        amout: parseInt(amout),
                        userId: userId ?? '',
                        workedhoursId,
                        serviceProjectId,
                        invoice_cost_project_id: invoice_cost_project_id
                    },
                });
            }

            if (errors.length > 0) {
                return res.status(400).json({ errors });
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
