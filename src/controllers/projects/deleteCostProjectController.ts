import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";

export class DeleteCostProjectController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string) {
        deleteFile(`./public/tmp/costproject/${file}`);
    }
    //eacd/a0e
    async handle(request: Request, response: Response) {
        try {
            const { cost_project_id } = request.body;

            // Verificação da existência do CostProject
            const costProject = await prisma.costProject.findFirst({
                where: {
                    id: cost_project_id
                },
                include: {
                    invoiceCostProject: true
                }
            });

            if (!costProject) {
                throw new Error("CostProject not found!");
            }

            // Verificação da quantidade de CostProjects relacionados ao InvoiceCostProject
            if (costProject.invoice_cost_project_id) {
                const relatedCostProjectsCount = await prisma.costProject.count({
                    where: {
                        invoice_cost_project_id: costProject.invoice_cost_project_id
                    }
                });

                // Se existir apenas um CostProject relacionado, também excluir o InvoiceCostProject
                if (relatedCostProjectsCount === 1) {
                    await prisma.invoiceCostProject.delete({
                        where: {
                            id: costProject.invoice_cost_project_id
                        }
                    });
                }
            }

            // Exclusão do CostProject
            await prisma.costProject.delete({
                where: {
                    id: cost_project_id
                }
            });

            // Exclusão de arquivos associados, se houver
            if (costProject.invoiceCostProject?.uri) {
                this.deleteFiles(costProject.invoiceCostProject?.uri);
            }

            return response.json();
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
