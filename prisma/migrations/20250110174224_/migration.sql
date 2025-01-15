/*
  Warnings:

  - You are about to drop the column `companyId` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `ServiceProject` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `catalog` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `project` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `service` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `subcategory` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `user_attendance` table. All the data in the column will be lost.
  - You are about to drop the column `companyId` on the `variable_service` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Client` DROP FOREIGN KEY `Client_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `ServiceProject` DROP FOREIGN KEY `ServiceProject_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `catalog` DROP FOREIGN KEY `catalog_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `project` DROP FOREIGN KEY `project_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `service` DROP FOREIGN KEY `service_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `subcategory` DROP FOREIGN KEY `subcategory_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `user_attendance` DROP FOREIGN KEY `user_attendance_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `variable_service` DROP FOREIGN KEY `variable_service_companyId_fkey`;

-- AlterTable
ALTER TABLE `Client` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ServiceProject` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `catalog` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `project` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `service` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `subcategory` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `user_attendance` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `variable_service` DROP COLUMN `companyId`,
    ADD COLUMN `company_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service` ADD CONSTRAINT `service_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcategory` ADD CONSTRAINT `subcategory_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variable_service` ADD CONSTRAINT `variable_service_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog` ADD CONSTRAINT `catalog_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_attendance` ADD CONSTRAINT `user_attendance_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
