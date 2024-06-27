import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";


export class UpdateCostProjectController {


    async handle(req: Request, res: Response) {
        try {
            let costProjects = req.body;

            if (!Array.isArray(costProjects)) {
                costProjects = [costProjects];
            }

            const errors: string[] = [];
            for (const project of costProjects) {
                const {
                    id,
                    material_name,
                    price,
                    amout,
                    userId,
                    service_id,
                    invoice_cost_project_id
                } = project;

                if(!id){
                    errors.push("Material name is required!");
                    continue;
                }

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
                if (!userId || !service_id || !invoice_cost_project_id) {
                    errors.push("User ID, service ID and invoice is required");
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

                const service = await prisma.service.findUnique({
                    where: { id: service_id }
                });

                if (!user) {
                    errors.push("User linked to invalid project!");
                    continue;
                }

                if (!service) {
                    errors.push("Service linked to invalid project!");
                    continue;
                }

                if (!invoice_cost_project_id) {
                    errors.push("invoice cost project to invalid!");
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
                        service_id,
                        invoice_cost_project_id: invoice_cost_project_id
                    },
                });
            }

            if (errors.length > 0) {
                return res.status(400).json({ errors });
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
