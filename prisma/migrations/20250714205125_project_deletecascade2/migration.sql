-- DropForeignKey
ALTER TABLE `Activities` DROP FOREIGN KEY `Activities_serviceProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `contract_project` DROP FOREIGN KEY `contract_project_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `cost_project` DROP FOREIGN KEY `cost_project_invoice_cost_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `cost_project` DROP FOREIGN KEY `cost_project_serviceProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `Estimate` DROP FOREIGN KEY `Estimate_canceledById_fkey`;

-- DropForeignKey
ALTER TABLE `Estimate` DROP FOREIGN KEY `Estimate_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `EstimateEmailLog` DROP FOREIGN KEY `EstimateEmailLog_estimateId_fkey`;

-- DropForeignKey
ALTER TABLE `EstimateServiceProject` DROP FOREIGN KEY `EstimateServiceProject_estimateId_fkey`;

-- DropForeignKey
ALTER TABLE `EstimateTimeline` DROP FOREIGN KEY `EstimateTimeline_estimateId_fkey`;

-- DropForeignKey
ALTER TABLE `fildsPdfProject` DROP FOREIGN KEY `fildsPdfProject_estimateId_fkey`;

-- DropForeignKey
ALTER TABLE `fildsPdfProject` DROP FOREIGN KEY `fildsPdfProject_invoiceId_fkey`;

-- DropForeignKey
ALTER TABLE `fildsPdfProject` DROP FOREIGN KEY `fildsPdfProject_pdfProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `GalleryAfter` DROP FOREIGN KEY `GalleryAfter_serviceProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `GalleryBefore` DROP FOREIGN KEY `GalleryBefore_serviceProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `ImgServiceProject` DROP FOREIGN KEY `ImgServiceProject_serviceProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `Invoice` DROP FOREIGN KEY `Invoice_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `Invoice` DROP FOREIGN KEY `Invoice_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `invoice_cost_project` DROP FOREIGN KEY `invoice_cost_project_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `InvoiceEmailLog` DROP FOREIGN KEY `InvoiceEmailLog_invoiceId_fkey`;

-- DropForeignKey
ALTER TABLE `InvoicePayment` DROP FOREIGN KEY `InvoicePayment_invoiceId_fkey`;

-- DropForeignKey
ALTER TABLE `InvoiceSendHistory` DROP FOREIGN KEY `InvoiceSendHistory_invoiceId_fkey`;

-- DropForeignKey
ALTER TABLE `InvoiceTimeline` DROP FOREIGN KEY `InvoiceTimeline_invoiceId_fkey`;

-- DropForeignKey
ALTER TABLE `pdf_project` DROP FOREIGN KEY `pdf_project_estimate_id_fkey`;

-- DropForeignKey
ALTER TABLE `pdf_project` DROP FOREIGN KEY `pdf_project_invoice_id_fkey`;

-- DropForeignKey
ALTER TABLE `pdf_project` DROP FOREIGN KEY `pdf_project_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `ServiceProject` DROP FOREIGN KEY `ServiceProject_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `ServiceStages` DROP FOREIGN KEY `ServiceStages_serviceProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `TimeLine` DROP FOREIGN KEY `TimeLine_service_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `TimeLine` DROP FOREIGN KEY `TimeLine_userServiceProjectId_fkey`;

-- DropForeignKey
ALTER TABLE `user_attendance` DROP FOREIGN KEY `user_attendance_user_service_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `user_service_project` DROP FOREIGN KEY `user_service_project_service_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `worked_hours` DROP FOREIGN KEY `worked_hours_project_id_fkey`;

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activities` ADD CONSTRAINT `Activities_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImgServiceProject` ADD CONSTRAINT `ImgServiceProject_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_project` ADD CONSTRAINT `contract_project_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceStages` ADD CONSTRAINT `ServiceStages_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GalleryBefore` ADD CONSTRAINT `GalleryBefore_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GalleryAfter` ADD CONSTRAINT `GalleryAfter_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_estimate_id_fkey` FOREIGN KEY (`estimate_id`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fildsPdfProject` ADD CONSTRAINT `fildsPdfProject_pdfProjectId_fkey` FOREIGN KEY (`pdfProjectId`) REFERENCES `pdf_project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fildsPdfProject` ADD CONSTRAINT `fildsPdfProject_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fildsPdfProject` ADD CONSTRAINT `fildsPdfProject_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_cost_project` ADD CONSTRAINT `invoice_cost_project_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_project` ADD CONSTRAINT `cost_project_invoice_cost_project_id_fkey` FOREIGN KEY (`invoice_cost_project_id`) REFERENCES `invoice_cost_project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_project` ADD CONSTRAINT `cost_project_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_service_project` ADD CONSTRAINT `user_service_project_service_project_id_fkey` FOREIGN KEY (`service_project_id`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_attendance` ADD CONSTRAINT `user_attendance_user_service_project_id_fkey` FOREIGN KEY (`user_service_project_id`) REFERENCES `user_service_project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeLine` ADD CONSTRAINT `TimeLine_service_project_id_fkey` FOREIGN KEY (`service_project_id`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeLine` ADD CONSTRAINT `TimeLine_userServiceProjectId_fkey` FOREIGN KEY (`userServiceProjectId`) REFERENCES `user_service_project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceSendHistory` ADD CONSTRAINT `InvoiceSendHistory_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoicePayment` ADD CONSTRAINT `InvoicePayment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Estimate` ADD CONSTRAINT `Estimate_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Estimate` ADD CONSTRAINT `Estimate_canceledById_fkey` FOREIGN KEY (`canceledById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstimateTimeline` ADD CONSTRAINT `EstimateTimeline_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstimateServiceProject` ADD CONSTRAINT `EstimateServiceProject_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstimateEmailLog` ADD CONSTRAINT `EstimateEmailLog_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceTimeline` ADD CONSTRAINT `InvoiceTimeline_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceEmailLog` ADD CONSTRAINT `InvoiceEmailLog_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
