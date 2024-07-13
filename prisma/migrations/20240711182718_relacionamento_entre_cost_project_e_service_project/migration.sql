-- AlterTable
ALTER TABLE `ServiceProject` ADD COLUMN `costProjectId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_costProjectId_fkey` FOREIGN KEY (`costProjectId`) REFERENCES `cost_project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
