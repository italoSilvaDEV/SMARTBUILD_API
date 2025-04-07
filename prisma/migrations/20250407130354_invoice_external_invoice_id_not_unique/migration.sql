-- DropIndex
DROP INDEX `Invoice_externalInvoiceId_key` ON `Invoice`;

-- CreateIndex
CREATE INDEX `Invoice_externalInvoiceId_invoiceType_idx` ON `Invoice`(`externalInvoiceId`, `invoiceType`);
