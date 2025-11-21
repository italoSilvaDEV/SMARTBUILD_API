-- CreateTable
CREATE TABLE `pdf_invoice_paid` (
    `id` VARCHAR(191) NOT NULL,
    `original_file_name` VARCHAR(191) NULL,
    `uri` VARCHAR(191) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pdf_invoice_paid_invoiceId_key`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pdf_invoice_paid` ADD CONSTRAINT `pdf_invoice_paid_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
