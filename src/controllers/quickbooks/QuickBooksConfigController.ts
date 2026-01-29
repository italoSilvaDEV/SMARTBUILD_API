import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class QuickBooksConfigController {
    // Buscar configurações de uma empresa
    async getConfigurations(req: Request, res: Response) {
        const { companyId } = req.params;

        try {
            const configurations = await prisma.quickBooksConfig.findMany({
                where: {
                    companyId: companyId
                },
                orderBy: {
                    date_creation: 'asc'
                }
            });

            return res.status(200).json({
                success: true,
                configurations
            });
        } catch (error) {
            // console.error("Erro ao buscar configurações do QuickBooks:", error);
            return res.status(500).json({
                success: false,
                error: "Internal Server Error"
            });
        }
    }

    // Buscar uma configuração específica
    async getConfiguration(req: Request, res: Response) {
        const { companyId, configType } = req.params;

        try {
            const configuration = await prisma.quickBooksConfig.findUnique({
                where: {
                    configType_companyId: {
                        configType: configType as any,
                        companyId: companyId
                    }
                }
            });

            return res.status(200).json({
                success: true,
                configuration
            });
        } catch (error) {
            // console.error("Erro ao buscar configuração do QuickBooks:", error);
            return res.status(500).json({
                success: false,
                error: "Internal Server Error"
            });
        }
    }

    // Atualizar ou criar uma configuração
    async updateConfiguration(req: Request, res: Response) {
        const { companyId } = req.params;
        const { configType, isActive } = req.body;

        try {
            // Validar dados de entrada
            if (!configType || typeof isActive !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: "configType and isActive are required"
                });
            }

            // Verificar se a empresa existe
            const company = await prisma.company.findUnique({
                where: { id: companyId }
            });

            if (!company) {
                return res.status(404).json({
                    success: false,
                    error: "Company not found"
                });
            }

            // Usar upsert para criar ou atualizar a configuração
            const configuration = await prisma.quickBooksConfig.upsert({
                where: {
                    configType_companyId: {
                        configType: configType,
                        companyId: companyId
                    }
                },
                update: {
                    isActive: isActive,
                    date_update: new Date()
                },
                create: {
                    configType: configType,
                    isActive: isActive,
                    companyId: companyId
                }
            });

            return res.status(200).json({
                success: true,
                message: `QuickBooks configuration ${isActive ? 'enabled' : 'disabled'} successfully`,
                configuration
            });
        } catch (error) {
            // console.error("Erro ao atualizar configuração do QuickBooks:", error);
            return res.status(500).json({
                success: false,
                error: "Internal Server Error"
            });
        }
    }

    // Deletar uma configuração
    async deleteConfiguration(req: Request, res: Response) {
        const { companyId, configType } = req.params;

        try {
            const configuration = await prisma.quickBooksConfig.findUnique({
                where: {
                    configType_companyId: {
                        configType: configType as any,
                        companyId: companyId
                    }
                }
            });

            if (!configuration) {
                return res.status(404).json({
                    success: false,
                    error: "Configuration not found"
                });
            }

            await prisma.quickBooksConfig.delete({
                where: {
                    configType_companyId: {
                        configType: configType as any,
                        companyId: companyId
                    }
                }
            });

            return res.status(200).json({
                success: true,
                message: "Configuration deleted successfully"
            });
        } catch (error) {
            // console.error("Erro ao deletar configuração do QuickBooks:", error);
            return res.status(500).json({
                success: false,
                error: "Internal Server Error"
            });
        }
    }
}
