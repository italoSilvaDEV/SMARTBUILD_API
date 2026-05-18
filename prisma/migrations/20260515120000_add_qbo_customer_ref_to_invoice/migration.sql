-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `qboCustomerRef` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Invoice_companyId_qboCustomerRef_idx` ON `Invoice`(`companyId`, `qboCustomerRef`);

