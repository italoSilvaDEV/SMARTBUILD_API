/*
  Warnings:

  - A unique constraint covering the columns `[email,company_id]` on the table `subcontractors` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
-- ALTER TABLE `sales_deal` DROP FOREIGN KEY `sales_deal_stageId_fkey`;

-- DropIndex
DROP INDEX `subcontractors_email_key` ON `subcontractors`;

-- AlterTable
ALTER TABLE `Invoice` MODIFY `hasBeenLinked` BOOLEAN NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `subcontractors_email_company_id_key` ON `subcontractors`(`email`, `company_id`);

-- AddForeignKey
-- ALTER TABLE `sales_deal` ADD CONSTRAINT `sales_deal_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `sales_stage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
