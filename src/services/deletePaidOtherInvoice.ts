import { prisma } from "../utils/prisma";
import { deleteFileFromS3 } from "../utils/S3/deleteFileFromS3";
import { isOwnerOfficeName } from "../utils/ownerFullAccess";

export class PaidOtherInvoiceDeletionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function deletePaidOtherInvoice(invoiceId: string, actorId: string): Promise<void> {
  const paidPdfKey = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payment: true,
        project: { select: { company_id: true, project_manager_id: true } },
        PaymentIntents: { select: { id: true }, take: 1 },
        paymentApplications: { select: { id: true }, take: 1 },
        pdfInvoicePaids: { select: { uri: true } },
      },
    });

    if (!invoice) throw new PaidOtherInvoiceDeletionError("Invoice not found", 404);
    if (invoice.status !== "paid" || invoice.invoiceType !== "custom") {
      throw new PaidOtherInvoiceDeletionError("Only paid Other invoices can be deleted here", 409);
    }

    const companyId = invoice.companyId || invoice.project?.company_id;
    if (!companyId || (invoice.companyId && invoice.project?.company_id !== invoice.companyId)) {
      throw new PaidOtherInvoiceDeletionError("Invoice company could not be verified", 409);
    }

    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: {
        company_id: true,
        invoiceEditAll: true,
        office: { select: { name: true } },
        companies: { where: { companyId }, select: { office: { select: { name: true } } }, take: 1 },
      },
    });
    if (!actor || (actor.company_id !== companyId && actor.companies.length === 0)) {
      throw new PaidOtherInvoiceDeletionError("Access denied for this company", 403);
    }
    if (!(
      actor.invoiceEditAll || isOwnerOfficeName(actor.office.name) ||
      actor.companies.some((link) => isOwnerOfficeName(link.office.name)) ||
      invoice.user_id === actorId || invoice.project_manager_id === actorId ||
      invoice.project?.project_manager_id === actorId
    )) {
      throw new PaidOtherInvoiceDeletionError("Not allowed to delete this invoice", 403);
    }

    if (
      invoice.stripeInvoiceId || invoice.stripePaymentIntentId ||
      invoice.idQuickBooksRef || invoice.idQuickbookContabio ||
      invoice.docNumberQuickBooksContabio || invoice.externalDocNumber ||
      invoice.qboCustomerRef || invoice.paymentMethodType ||
      invoice.totalAmountPaid !== null || invoice.totalAmountPaidQbo !== null ||
      invoice.balanceRemaining !== null || invoice.PaymentIntents.length > 0 ||
      invoice.paymentApplications.length > 0
    ) {
      throw new PaidOtherInvoiceDeletionError("Invoice has an external payment or accounting integration", 409);
    }

    await tx.invoiceDeletionAudit.create({
      data: {
        invoiceId: invoice.id,
        companyId,
        projectId: invoice.projectId,
        estimateId: invoice.estimateId,
        deletedById: actorId,
        invoiceNumber: invoice.externalInvoiceId,
        invoiceType: invoice.invoiceType,
        invoiceStatus: invoice.status,
        invoiceAmount: invoice.totalAmount,
        paymentMethod: invoice.payment?.paymentMethod,
        paymentAmount: invoice.payment?.amount,
        paymentPaidAt: invoice.payment?.paidAt,
      },
    });

    // The payment timeline is project/estimate-scoped, not invoice-scoped. Record the reversal there.
    await tx.invoicePaymentTimeLine.create({
      data: {
        description: `Paid Other invoice #${invoice.externalInvoiceId || invoice.id} deleted; payment removed from totals`,
        ...(invoice.type_invoicebase === "estimate" && invoice.estimateId
          ? { estimateId: invoice.estimateId }
          : { projectId: invoice.projectId }),
      },
    });

    await tx.invoice.delete({ where: { id: invoice.id } });
    return invoice.pdfInvoicePaids?.uri;
  }, { isolationLevel: "Serializable" });

  if (paidPdfKey) {
    try {
      await deleteFileFromS3(paidPdfKey);
    } catch (error) {
      console.error("[PaidOtherInvoiceDeletion] Paid PDF cleanup failed:", error);
    }
  }
}
