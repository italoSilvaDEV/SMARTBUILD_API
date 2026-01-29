import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import S3Storage from "../../utils/S3/s3Storage";

export class DeleteCostProjectController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    async deleteFiles(file: string) {

        const s3 = new S3Storage()
        await s3.deleteFile(file);
    }
    //eacd/a0e
    async handle(request: Request, response: Response) {
        try {
            const { cost_project_id } = request.params;

            // Usar transação para garantir consistência
            await prisma.$transaction(async (tx) => {
                // Verificação da existência do CostProject
                const costProject = await tx.costProject.findFirst({
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

                // Salvar informações do arquivo para exclusão posterior
                const fileToDelete = costProject.invoiceCostProject?.uri;
                let shouldDeleteInvoice = false;

                // Verificação da quantidade de CostProjects relacionados ao InvoiceCostProject
                if (costProject.invoice_cost_project_id) {
                    const relatedCostProjectsCount = await tx.costProject.count({
                        where: {
                            invoice_cost_project_id: costProject.invoice_cost_project_id
                        }
                    });

                    // Se existir apenas um CostProject relacionado, marcar para exclusão do InvoiceCostProject
                    shouldDeleteInvoice = relatedCostProjectsCount === 1;
                }

                // Primeiro: Exclusão do CostProject
                await tx.costProject.delete({
                    where: {
                        id: cost_project_id
                    }
                });

                // Segundo: Se necessário, excluir o InvoiceCostProject
                if (shouldDeleteInvoice && costProject.invoice_cost_project_id) {
                    await tx.invoiceCostProject.delete({
                        where: {
                            id: costProject.invoice_cost_project_id
                        }
                    });
                }

                // Exclusão de arquivos associados (fora da transação para não bloquear)
                if (fileToDelete) {
                    // Executar de forma assíncrona sem aguardar
                    this.deleteFiles(fileToDelete).catch(error => {
                        // console.error('Erro ao deletar arquivo:', error);
                    });
                }
            });

            return response.json({ message: "Cost project deleted successfully" });
        } catch (error) {
            // console.error(error);
            if (error instanceof Error) {
                return response.status(400).json({ error: error.message });
            }
            return response.status(500).json({ error: "Erro interno do servidor" });
        }
    }
}
