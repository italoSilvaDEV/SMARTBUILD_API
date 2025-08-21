import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class GetEstimateNumberController {
    async handle(req: Request, res: Response) {
        const {
            companyId
        } = req.params

        try {
            const number = await prisma.project.findMany({
                where: {
                    company_id: companyId
                },
            })

            return res.status(200).json({
                number: number.length + 1000
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while getting estimate number"
            })
        }
    }
}