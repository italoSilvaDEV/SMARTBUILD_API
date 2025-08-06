/*
  Warnings:

  - A unique constraint covering the columns `[idQuickbooks,company_id]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Client` ADD COLUMN `idQuickbooks` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Client_idQuickbooks_company_id_key` ON `Client`(`idQuickbooks`, `company_id`);
