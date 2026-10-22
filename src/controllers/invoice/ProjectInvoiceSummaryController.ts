import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { userHasFullAccess } from "../../utils/ownerFullAccess";

export class ProjectInvoiceSummaryController {
  async handle(req: Request, res: Response) {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.projectId },
        select: { company_id: true, project_manager_id: true },
      });
      if (!project?.company_id) return res.status(404).json({ error: "Project not found" });

      const member = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            { company_id: project.company_id },
            { companies: { some: { companyId: project.company_id } } },
          ],
        },
        select: { id: true },
      });
      if (!member) return res.status(403).json({ error: "Access denied" });

      const canViewAll = project.project_manager_id === userId ||
        await userHasFullAccess(userId, "invoiceEditAll", project.company_id);

      // Keep the list's visibility rules, but never apply pagination to financial totals.
      const invoices = await prisma.invoice.findMany({
        where: {
          projectId: req.params.projectId,
          OR: [{ cancel_invoice_edit: false }, { cancel_invoice_edit: null }],
          ...(!canViewAll ? {
            AND: [{ OR: [{ user_id: userId }, { project_manager_id: userId }] }],
          } : {}),
        },
        select: {
          status: true,
          invoiceType: true,
          totalAmount: true,
          paymentApplications: { select: { amountApplied: true } },
        },
      });

      let paid = 0;
      let received = new Prisma.Decimal(0);
      for (const invoice of invoices) {
        const status = invoice.status.toLowerCase();
        if (status === "paid") {
          paid++;
          received = received.plus(invoice.totalAmount);
        } else if (status === "partial" && invoice.invoiceType === "quickbooks") {
          for (const payment of invoice.paymentApplications) {
            received = received.plus(payment.amountApplied);
          }
        }
      }

      return res.json({ total: invoices.length, paid, receivedAmount: received.toNumber() });
    } catch (error) {
      console.error("Error fetching project invoice summary:", error);
      return res.status(500).json({ error: "Failed to fetch invoice summary" });
    }
  }
}
