-- CreateTable
CREATE TABLE `fildsPdfProject` (
    `id` VARCHAR(191) NOT NULL,
    `sections` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `pdfProjectId` VARCHAR(191) NULL,
    `estimateId` VARCHAR(191) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fildsPdfProject` ADD CONSTRAINT `fildsPdfProject_pdfProjectId_fkey` FOREIGN KEY (`pdfProjectId`) REFERENCES `pdf_project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fildsPdfProject` ADD CONSTRAINT `fildsPdfProject_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fildsPdfProject` ADD CONSTRAINT `fildsPdfProject_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
