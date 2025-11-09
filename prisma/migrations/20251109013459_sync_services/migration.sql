/*
  Warnings:

  - A unique constraint covering the columns `[estimateServiceId]` on the table `ServiceProject` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `ServiceProject` ADD COLUMN `estimateServiceId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ServiceProject_estimateServiceId_key` ON `ServiceProject`(`estimateServiceId`);

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_estimateServiceId_fkey` FOREIGN KEY (`estimateServiceId`) REFERENCES `EstimateServiceProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
