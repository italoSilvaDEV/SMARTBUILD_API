-- AlterTable
ALTER TABLE `change_order` ADD COLUMN `projectId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `change_order` ADD CONSTRAINT `change_order_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
