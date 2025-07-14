-- DropForeignKey
ALTER TABLE `Invoice` DROP FOREIGN KEY `Invoice_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `invoice_cost_project` DROP FOREIGN KEY `invoice_cost_project_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `pdf_project` DROP FOREIGN KEY `pdf_project_estimate_id_fkey`;

-- DropForeignKey
ALTER TABLE `pdf_project` DROP FOREIGN KEY `pdf_project_invoice_id_fkey`;

-- DropForeignKey
ALTER TABLE `pdf_project` DROP FOREIGN KEY `pdf_project_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `ServiceProject` DROP FOREIGN KEY `ServiceProject_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `worked_hours` DROP FOREIGN KEY `worked_hours_project_id_fkey`;

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_project` ADD CONSTRAINT `contract_project_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_estimate_id_fkey` FOREIGN KEY (`estimate_id`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_cost_project` ADD CONSTRAINT `invoice_cost_project_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Estimate` ADD CONSTRAINT `Estimate_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Estimate` ADD CONSTRAINT `Estimate_canceledById_fkey` FOREIGN KEY (`canceledById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
