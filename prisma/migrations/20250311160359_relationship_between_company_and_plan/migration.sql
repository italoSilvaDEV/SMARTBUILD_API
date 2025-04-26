/*
  Warnings:

  - You are about to drop the column `permissionGroupId` on the `Company` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Company` DROP FOREIGN KEY `Company_permissionGroupId_fkey`;

-- AlterTable
ALTER TABLE `Company` DROP COLUMN `permissionGroupId`,
    ADD COLUMN `planId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Company` ADD CONSTRAINT `Company_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
