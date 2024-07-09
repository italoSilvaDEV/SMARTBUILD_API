-- AlterTable
ALTER TABLE `ServiceProject` ADD COLUMN `projectId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
