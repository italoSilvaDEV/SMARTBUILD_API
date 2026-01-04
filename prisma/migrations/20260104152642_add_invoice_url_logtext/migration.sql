-- DropForeignKey
-- ALTER TABLE `sales_deal` DROP FOREIGN KEY `sales_deal_stageId_fkey`;

-- AlterTable
ALTER TABLE `Invoice` MODIFY `invoiceUrl` TEXT NULL;

-- AddForeignKey
-- ALTER TABLE `sales_deal` ADD CONSTRAINT `sales_deal_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `sales_stage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
