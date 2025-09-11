import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateInvoiceController {
    async updateTotalAmount(req: Request, res: Response) {
        const {
            invoiceId,
            totalAmount
        } = req.body

        if (!invoiceId) {
            return res.status(400).json({
                error: "Invoice ID is required"
            })
        }

        const invoice = await prisma.invoice.findUnique({
            where: {
                id: invoiceId
            }
        })

        if (!invoice) {
            return res.status(404).json({
                error: "Invoice not found"
            })
        }

        try {
            const invoiceUpdated = await prisma.invoice.update({
                where: {
                    id: invoiceId
                },
                data: {
                    totalAmount: totalAmount
                },
                select: {
                    totalAmount: true
                }
            })

            return res.status(200).json({
                message: "Invoice total amount updated successfully",
                data: invoiceUpdated
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}