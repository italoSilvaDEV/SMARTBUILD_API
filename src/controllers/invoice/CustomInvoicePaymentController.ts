import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CustomInvoicePaymentController {
  async createPayment(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { paymentMethod, notes, amount } = req.body;

    try {
      // Verificar se a fatura existe e é do tipo custom
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          type_invoicebase: true,
          invoiceType: true,
          payment: true,
          externalInvoiceId: true,
          updatedAt: true,
          totalAmount: true,
          project: {
            select: {
              id: true,
            }
          },
          estimate: {
            select: {
              id: true,
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Not a custom invoice" });
      }

      // Verificar se já existe um pagamento para esta fatura
      if (invoice.payment) {
        return res.status(400).json({
          error: "Payment already exists for this invoice",
          payment: invoice.payment
        });
      }

      // Validar o método de pagamento
      if (!paymentMethod) {
        return res.status(400).json({ error: "Payment method is required" });
      }

      // Validar o valor do pagamento
      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Valid payment amount is required" });
      }

      await prisma.$transaction(async (smartbuild) => {
        const payment = await smartbuild.invoicePayment.create({
          data: {
            paymentMethod,
            notes: notes || "",
            amount,
            invoiceId
          }
        });

        await smartbuild.invoice.update({
          where: { id: invoiceId },
          data: {
            status: "paid",
            updatedAt: new Date()
          }
        });

        await smartbuild.invoiceTimeline.create({
          data: {
            description: `Payment`,
            invoice: {
              connect: { id: invoiceId }
            }
          }
        });

        if (invoice.type_invoicebase === "project" && invoice.project) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice " + invoice.externalInvoiceId + " of " + invoice.totalAmount + " on " + invoice.updatedAt.toLocaleDateString('en-US'),
              projectId: invoice.project.id
            }
          })
        } else if (invoice.type_invoicebase === "estimate" && invoice.estimate) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice " + invoice.externalInvoiceId + " of " + invoice.totalAmount + " on " + invoice.updatedAt.toLocaleDateString('en-US'),
              estimateId: invoice.estimate.id
            }
          })
        }

        return res.status(201).json({
          message: "Payment recorded successfully",
          payment
        });
      })
    } catch (error: any) {
      console.error("Error recording custom invoice payment:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async getPayment(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      const payment = await prisma.invoicePayment.findUnique({
        where: { invoiceId }
      });

      if (!payment) {
        return res.status(404).json({ error: "Payment not found for this invoice" });
      }

      return res.status(200).json(payment);
    } catch (error: any) {
      console.error("Error fetching payment:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async updatePayment(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { paymentMethod, notes, amount } = req.body;

    try {
      // Verificar se o pagamento existe
      const existingPayment = await prisma.invoicePayment.findUnique({
        where: { invoiceId }
      });

      if (!existingPayment) {
        return res.status(404).json({ error: "Payment not found for this invoice" });
      }

      // Atualizar o pagamento
      const updatedPayment = await prisma.invoicePayment.update({
        where: { invoiceId },
        data: {
          paymentMethod: paymentMethod || existingPayment.paymentMethod,
          notes: notes !== undefined ? notes : existingPayment.notes,
          amount: amount || existingPayment.amount
        }
      });

      return res.status(200).json({
        message: "Payment updated successfully",
        payment: updatedPayment
      });
    } catch (error: any) {
      console.error("Error updating payment:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 