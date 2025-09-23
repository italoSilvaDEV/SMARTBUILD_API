import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class ContractTermController {
    async handle(req: Request, res: Response) {
        const {
            terms,
            type,
            companyId
        } = req.body

        if (terms === undefined || !type || !companyId) {
            return res.status(400).json({
                error: "Terms, type and companyId are required"
            })
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!company) {
            return res.status(400).json({
                error: "Company not found"
            })
        }

        if (type !== "letter" && type !== "termseconditions") {
            return res.status(400).json({
                error: "Type must be either letter or termseconditions"
            })
        }

        try {
            const termExists = await prisma.contractTerms.findUnique({
                where: {
                    contractTermsType_companyId: {
                        contractTermsType: type,
                        companyId: companyId
                    }
                }
            })

            if (termExists) {
                const handleTerm = await prisma.contractTerms.update({
                    where: {
                        contractTermsType_companyId: {
                            contractTermsType: type,
                            companyId: companyId,
                        }
                    },
                    data: {
                        terms: terms
                    },
                })

                return res.status(200).json({
                    message: "Contract terms updated successfully",
                    data: handleTerm
                })
            } else {
                const newTerm = await prisma.contractTerms.create({
                    data: {
                        terms: terms,
                        companyId: companyId,
                        contractTermsType: type
                    }
                })

                return res.status(200).json({
                    message: "Contract terms created successfully",
                    data: newTerm
                })
            }
        } catch (error) {
            res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async get(req: Request, res: Response) {
        const {
            companyId
        } = req.params

        if (!companyId) {
            return res.status(400).json({
                error: "Company ID is required"
            })
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!company) {
            return res.status(400).json({
                error: "Company not found"
            })
        }

        try {
            const allTerms = await prisma.contractTerms.findMany({
                where: {
                    companyId: companyId
                }
            })

            return res.status(200).json({
                data: allTerms
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}