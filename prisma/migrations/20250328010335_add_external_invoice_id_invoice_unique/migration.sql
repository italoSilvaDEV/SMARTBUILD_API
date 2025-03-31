/*
  Warnings:

  - You are about to alter the column `externalInvoiceId` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `Invoice` MODIFY `externalInvoiceId` VARCHAR(191) NULL;

-- RenameIndex
ALTER TABLE `Invoice` RENAME INDEX `unique_externalInvoiceId` TO `Invoice_externalInvoiceId_key`;
