import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import jwt from "jsonwebtoken";

export class DeleteCompanyMasterController {
    async requestDeletion(req: Request, res: Response) {
        const { masterKey } = req.body;

        if (!masterKey) {
            return res.status(400).json({
                error: "Master Key is required"
            });
        }

        try {
            const keyRecord = await prisma.permissionsKeys.findUnique({
                where: {
                    key: masterKey
                },
                include: {
                    permissionUserKey: true
                }
            });

            if (!keyRecord || keyRecord.status !== "approved") {
                return res.status(403).json({
                    error: "Invalid or unapproved Master Key"
                });
            }

            const deletionToken = jwt.sign(
                {
                    purpose: "company_deletion",
                    keyId: keyRecord.id,
                    userPermissionId: keyRecord.permissionUserKeyId
                },
                process.env.SECRET_JWT || "default_secret",
                { expiresIn: "60s" }
            );

            return res.status(200).json({
                success: true,
                deletionToken
            });

        } catch (error) {
            console.error("Error in requestDeletion:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async confirmDeletion(req: Request, res: Response) {
        const { deletionToken, companyId, reason } = req.body;

        if (!deletionToken || !companyId || !reason) {
            return res.status(400).json({
                error: "Token, Company ID and Reason are required"
            });
        }

        try {
            const decoded = jwt.verify(deletionToken, process.env.SECRET_JWT || "default_secret") as any;

            if (decoded.purpose !== "company_deletion") {
                return res.status(401).json({ error: "Invalid token purpose" });
            }

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: {
                    Plan: true
                }
            });

            if (!company) {
                return res.status(404).json({ error: "Company not found" });
            }

            const isFree = company.Plan?.validityType === "FREE" || company.Plan?.name?.toLowerCase().includes("free");

            if (!isFree) {
                return res.status(403).json({ error: "Only companies with FREE plans can be deleted via Master Key currently." });
            }

            await prisma.$transaction(async (tx) => {
                await tx.user.updateMany({
                    where: { company_id: companyId },
                    data: { company_id: null }
                });

                const projectIds = (await tx.project.findMany({
                    where: { company_id: companyId },
                    select: { id: true }
                })).map(p => p.id);

                await tx.category.deleteMany({ where: { company_id: companyId } });
                await tx.subCategory.deleteMany({ where: { company_id: companyId } });
                await tx.service.deleteMany({ where: { company_id: companyId } });
                await tx.catalog.deleteMany({ where: { company_id: companyId } });
                await tx.client.deleteMany({ where: { company_id: companyId } });
                await tx.subcontractor.deleteMany({ where: { company_id: companyId } });
                await tx.syncPreferences.deleteMany({ where: { companyId: companyId } });
                await tx.syncStatus.deleteMany({ where: { companyId: companyId } });
                await tx.contractTerms.deleteMany({ where: { companyId: companyId } });
                await tx.quickBooksConfig.deleteMany({ where: { companyId: companyId } });
                await tx.projectFiles.deleteMany({ where: { companyId: companyId } });
                await tx.projectPastes.deleteMany({ where: { companyId: companyId } });
                await tx.imagesAttachments.deleteMany({ where: { projectId: { in: projectIds } } });
                await tx.quickBooksAccount.deleteMany({ where: { company_id: companyId } });
                await tx.subscription.deleteMany({ where: { companyId: companyId } });
                await tx.project.deleteMany({ where: { company_id: companyId } });
                await tx.company.delete({ where: { id: companyId } });

                await tx.masterActionsHistory.create({
                    data: {
                        action: "DELETE_COMPANY",
                        reason: reason,
                        targetName: company.name,
                        targetContact: `${company.email || 'N/A'}, ${company.phone || 'N/A'}`,
                        userPermissionId: decoded.userPermissionId,
                        userPermissionKeyId: decoded.keyId
                    }
                });
            });

            return res.status(200).json({
                success: true,
                message: "Company and all related data deleted successfully."
            });

        } catch (error: any) {
            console.error("Error in confirmDeletion master:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
