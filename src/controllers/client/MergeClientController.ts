import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class MergeClientController {
    // Preview dos dados de um cliente para o merge
    async getClientMergePreview(req: Request, res: Response) {
        try {
            const { clientId } = req.params;
            const { company_id } = req.query;

            if (!clientId || !company_id) {
                return res.status(400).json({ error: "Client ID and Company ID are required" });
            }

            // Buscar cliente com todos os dados relacionados
            const client = await prisma.client.findUnique({
                where: {
                    id: clientId,
                    company_id: String(company_id)
                },
                include: {
                    projects: {
                        select: {
                            id: true,
                            contract_number: true,
                            price: true,
                            status_project: true,
                            date_creation: true,
                            invoices: {
                                select: {
                                    id: true,
                                    totalAmount: true,
                                    status: true
                                }
                            },
                            estimates: {
                                select: {
                                    id: true,
                                    number: true,
                                    totalAmount: true,
                                    status: true
                                }
                            }
                        }
                    },
                    workContexts: {
                        select: {
                            id: true,
                            type: true,
                            label: true,
                            Name: true,
                            location: true
                        }
                    },
                    QuickBooksCustomerRaw: {
                        select: {
                            id: true,
                            quickbooksId: true,
                            status: true
                        }
                    }
                }
            });

            if (!client) {
                return res.status(404).json({ error: "Client not found" });
            }

            // Calcular totais
            const totalProjects = client.projects.length;
            const totalInvoices = client.projects.reduce((sum, p) => sum + p.invoices.length, 0);
            const totalEstimates = client.projects.reduce((sum, p) => sum + p.estimates.length, 0);
            const totalWorkContexts = client.workContexts.length;

            const invoiceTotal = client.projects.reduce((sum, p) => 
                sum + p.invoices.reduce((iSum, i) => iSum + Number(i.totalAmount), 0), 0
            );

            const estimateTotal = client.projects.reduce((sum, p) => 
                sum + p.estimates.reduce((eSum, e) => eSum + Number(e.totalAmount), 0), 0
            );

            return res.json({
                client: {
                    id: client.id,
                    name: client.name,
                    email: client.email,
                    phone: client.phone,
                    document: client.document,
                    location: client.location,
                    idQuickbooks: client.idQuickbooks,
                    hasQuickBooksConnection: !!client.idQuickbooks
                },
                summary: {
                    totalProjects,
                    totalInvoices,
                    totalEstimates,
                    totalWorkContexts,
                    invoiceTotal,
                    estimateTotal
                },
                projects: client.projects.map(p => ({
                    id: p.id,
                    contract_number: p.contract_number,
                    price: Number(p.price),
                    status: p.status_project,
                    date_creation: p.date_creation,
                    invoicesCount: p.invoices.length,
                    estimatesCount: p.estimates.length
                })),
                invoices: client.projects.flatMap(p => 
                    p.invoices.map(inv => ({
                        id: inv.id,
                        projectId: p.id,
                        amount: Number(inv.totalAmount),
                        status: inv.status
                    }))
                ),
                estimates: client.projects.flatMap(p => 
                    p.estimates.map(est => ({
                        id: est.id,
                        projectId: p.id,
                        number: est.number,
                        amount: Number(est.totalAmount),
                        status: est.status
                    }))
                ),
                workContexts: client.workContexts,
                quickbooksData: client.QuickBooksCustomerRaw
            });
        } catch (error) {
            console.error("Error in getClientMergePreview:", error);
            return res.status(500).json({ 
                error: error instanceof Error ? error.message : "Internal server error" 
            });
        }
    }

    // Validar possibilidade de merge
    async validateMerge(req: Request, res: Response) {
        try {
            const { sourceClientId, targetClientId } = req.body;
            const { company_id } = req.query;

            if (!sourceClientId || !targetClientId || !company_id) {
                return res.status(400).json({ 
                    error: "Source Client ID, Target Client ID and Company ID are required" 
                });
            }

            if (sourceClientId === targetClientId) {
                return res.status(400).json({ 
                    error: "Cannot merge a client with itself" 
                });
            }

            // Buscar ambos clientes
            const [sourceClient, targetClient] = await Promise.all([
                prisma.client.findUnique({
                    where: { id: sourceClientId, company_id: String(company_id) },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        idQuickbooks: true,
                        company_id: true
                    }
                }),
                prisma.client.findUnique({
                    where: { id: targetClientId, company_id: String(company_id) },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        idQuickbooks: true,
                        company_id: true
                    }
                })
            ]);

            if (!sourceClient || !targetClient) {
                return res.status(404).json({ error: "One or both clients not found" });
            }

            if (sourceClient.company_id !== targetClient.company_id) {
                return res.status(400).json({ 
                    error: "Clients must belong to the same company" 
                });
            }

            // Verificar conflito de QuickBooks
            const hasQuickBooksConflict = !!(
                sourceClient.idQuickbooks && 
                targetClient.idQuickbooks && 
                sourceClient.idQuickbooks !== targetClient.idQuickbooks
            );

            const warnings = [];

            if (hasQuickBooksConflict) {
                warnings.push({
                    type: 'QUICKBOOKS_CONFLICT',
                    severity: 'HIGH',
                    message: 'Both clients have different QuickBooks IDs. The QuickBooks link from the source client will be lost after the merge.',
                    details: {
                        sourceQBId: sourceClient.idQuickbooks,
                        targetQBId: targetClient.idQuickbooks
                    }
                });
            } else if (sourceClient.idQuickbooks && !targetClient.idQuickbooks) {
                warnings.push({
                    type: 'QUICKBOOKS_SOURCE_ONLY',
                    severity: 'MEDIUM',
                    message: 'The QuickBooks link from the source client will be lost after the merge.',
                    details: {
                        sourceQBId: sourceClient.idQuickbooks
                    }
                });
            } else if (!sourceClient.idQuickbooks && targetClient.idQuickbooks) {
                warnings.push({
                    type: 'QUICKBOOKS_TARGET_ONLY',
                    severity: 'LOW',
                    message: 'Only the target client has a QuickBooks ID. No additional action needed in QuickBooks.',
                    details: {
                        targetQBId: targetClient.idQuickbooks
                    }
                });
            }

            return res.json({
                valid: true,
                hasQuickBooksConflict,
                warnings,
                source: {
                    id: sourceClient.id,
                    name: sourceClient.name,
                    email: sourceClient.email,
                    idQuickbooks: sourceClient.idQuickbooks
                },
                target: {
                    id: targetClient.id,
                    name: targetClient.name,
                    email: targetClient.email,
                    idQuickbooks: targetClient.idQuickbooks
                }
            });
        } catch (error) {
            console.error("Error in validateMerge:", error);
            return res.status(500).json({ 
                error: error instanceof Error ? error.message : "Internal server error" 
            });
        }
    }

    // Executar merge de clientes
    async executeClientMerge(req: Request, res: Response) {
        try {
            const { sourceClientId, targetClientId, userId } = req.body;
            const { company_id } = req.query;

            if (!sourceClientId || !targetClientId || !company_id || !userId) {
                return res.status(400).json({ 
                    error: "Source Client ID, Target Client ID, User ID and Company ID are required" 
                });
            }

            if (sourceClientId === targetClientId) {
                return res.status(400).json({ 
                    error: "Cannot merge a client with itself" 
                });
            }

            // Executar merge em transação atômica
            const result = await prisma.$transaction(async (tx) => {
                // 1. Buscar ambos clientes
                const [sourceClient, targetClient] = await Promise.all([
                    tx.client.findUnique({
                        where: { id: sourceClientId, company_id: String(company_id) },
                        include: {
                            projects: { select: { id: true } },
                            workContexts: { select: { id: true } },
                            QuickBooksCustomerRaw: { select: { id: true } }
                        }
                    }),
                    tx.client.findUnique({
                        where: { id: targetClientId, company_id: String(company_id) }
                    })
                ]);

                if (!sourceClient || !targetClient) {
                    throw new Error("One or both clients not found");
                }

                if (sourceClient.company_id !== targetClient.company_id) {
                    throw new Error("Clients must belong to the same company");
                }

                const stats = {
                    projectsMoved: 0,
                    workContextsMoved: 0,
                    quickbooksRecordsMoved: 0
                };

                // 2. Mover todos os projetos
                const projectsUpdate = await tx.project.updateMany({
                    where: { client_id: sourceClientId },
                    data: { client_id: targetClientId }
                });
                stats.projectsMoved = projectsUpdate.count;

                // 3. Mover todos os work contexts
                const workContextsUpdate = await tx.workContext.updateMany({
                    where: { clientId: sourceClientId },
                    data: { clientId: targetClientId }
                });
                stats.workContextsMoved = workContextsUpdate.count;

                // 4. Tratar QuickBooksCustomerRaw
                const qbRawUpdate = await tx.quickBooksCustomerRaw.updateMany({
                    where: { clientId: sourceClientId },
                    data: { 
                        clientId: targetClientId,
                        status: 'MERGED',
                        reason: 'CLIENT_MERGE'
                    }
                });
                stats.quickbooksRecordsMoved = qbRawUpdate.count;

                // 5. Registrar merge no histórico (criar registro de auditoria)
                const mergeHistoryData = {
                    sourceClientId: sourceClient.id,
                    sourceClientName: sourceClient.name,
                    sourceClientEmail: sourceClient.email,
                    sourceClientIdQuickbooks: sourceClient.idQuickbooks,
                    targetClientId: targetClient.id,
                    targetClientName: targetClient.name,
                    targetClientEmail: targetClient.email,
                    targetClientIdQuickbooks: targetClient.idQuickbooks,
                    stats,
                    mergedAt: new Date(),
                    mergedBy: userId
                };

                // Criar registro em QuickBooksCustomerRaw como histórico
                await tx.quickBooksCustomerRaw.create({
                    data: {
                        companyId: String(company_id),
                        clientId: targetClientId,
                        quickbooksId: sourceClient.idQuickbooks || 'NONE',
                        payload: mergeHistoryData,
                        reason: 'CLIENT_MERGE_HISTORY',
                        status: 'REVIEWED'
                    }
                });

                // 6. Deletar cliente de origem (hard delete)
                // Como todos os relacionamentos já foram movidos para o targetClient,
                // é seguro deletar o sourceClient
                await tx.client.delete({
                    where: { id: sourceClientId }
                });

                return {
                    success: true,
                    stats,
                    sourceClient: {
                        id: sourceClient.id,
                        name: sourceClient.name,
                        idQuickbooks: sourceClient.idQuickbooks
                    },
                    targetClient: {
                        id: targetClient.id,
                        name: targetClient.name,
                        idQuickbooks: targetClient.idQuickbooks
                    }
                };
            }, {
                timeout: 30000, // 30 segundos
                maxWait: 5000
            });

            console.log('[Client Merge] Local merge completed successfully. No QuickBooks merge attempted (conservative approach).');

            return res.json(result);
        } catch (error) {
            console.error("Error in executeClientMerge:", error);
            return res.status(500).json({ 
                error: error instanceof Error ? error.message : "Internal server error" 
            });
        }
    }
}

