-- AlterTable
ALTER TABLE `cost_project` ADD COLUMN `serviceProjectId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `cost_project` ADD CONSTRAINT `cost_project_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
