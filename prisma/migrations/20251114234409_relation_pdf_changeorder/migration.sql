-- AlterTable
ALTER TABLE `pdf_project` ADD COLUMN `changeOrderId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_changeOrderId_fkey` FOREIGN KEY (`changeOrderId`) REFERENCES `change_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
