import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";


export class UpdateCostProjectController {


    async handle(req: Request, res: Response) {
        try {
            let costProjects = req.body;

            if (!Array.isArray(costProjects)) {
                costProjects = [costProjects];
            }

            const error: string[] = [];
            for (const project of costProjects) {
                const {
                    id,
                    material_name,
                    price,
                    amout,
                    userId,
                    service_project_id,
                    invoice_cost_project_id
                } = project;

                if(!id){
                    error.push("Material name is required!");
                    continue;
                }
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
                if (!userId || !service_project_id || !invoice_cost_project_id) {
                    error.push("User ID, service ID and invoice is required");
                    continue;
                }

                const costproject = await prisma.costProject.findUnique({
                    where:{
                        id
                    }
                })

                if(!costproject){
                    throw new Error("id cost project is required!");
                }

                const user = await prisma.user.findUnique({
                    where: { id: userId }
                });

                const service = await prisma.serviceProject.findUnique({
                    where: { id: service_project_id }
                });

                if (!user) {
                    error.push("User linked to invalid project!");
                    continue;
                }

                if (!service) {
                    error.push("Service linked to invalid project!");
                    continue;
                }

                if (!invoice_cost_project_id) {
                    error.push("invoice cost project to invalid!");
                    continue;
                }


                await prisma.costProject.update({
                    where:{
                        id
                    },
                    data: {
                        material_name,
                        price: parseFloat(price),
                        amout: parseInt(amout),
                        userId,
                        serviceProjectId: service_project_id,
                        invoice_cost_project_id: invoice_cost_project_id
                    },
                });
            }

            if (error.length > 0) {
                return res.status(400).json({ error });
            }

            return res.json();

        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal error" });
        }
    }
}
