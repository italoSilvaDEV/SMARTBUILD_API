-- AlterTable
ALTER TABLE `pdf_project` ADD COLUMN `estimate_id` VARCHAR(191) NULL,
    ADD COLUMN `invoice_id` VARCHAR(191) NULL,
    ADD COLUMN `type_pdf` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_estimate_id_fkey` FOREIGN KEY (`estimate_id`) REFERENCES `Estimate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
