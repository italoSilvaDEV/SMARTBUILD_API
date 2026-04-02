/*
  Warnings:

  - A unique constraint covering the columns `[idQuickbooks]` on the table `Estimate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idQuickbooks]` on the table `project` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Estimate` ADD COLUMN `idQuickbooks` VARCHAR(191) NULL,
    ADD COLUMN `quickbooksUpdatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `EstimateServiceProject` ADD COLUMN `idQuickbooksLine` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `project` ADD COLUMN `idQuickbooks` VARCHAR(191) NULL,
    ADD COLUMN `quickbooksUpdatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `sync_execution` MODIFY `entity` ENUM('customers', 'invoices', 'payments', 'projects', 'estimates') NOT NULL;

-- AlterTable
ALTER TABLE `sync_preferences` MODIFY `typesEntity` ENUM('customers', 'invoices', 'payments', 'projects', 'estimates') NOT NULL;

-- AlterTable
ALTER TABLE `sync_status` MODIFY `entity` ENUM('customers', 'invoices', 'payments', 'projects', 'estimates') NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Estimate_idQuickbooks_key` ON `Estimate`(`idQuickbooks`);

-- CreateIndex
CREATE UNIQUE INDEX `project_idQuickbooks_key` ON `project`(`idQuickbooks`);
