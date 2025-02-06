-- DropForeignKey
ALTER TABLE `Invoice` DROP FOREIGN KEY `Invoice_companyId_fkey`;

-- AlterTable
ALTER TABLE `Invoice` MODIFY `companyId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
