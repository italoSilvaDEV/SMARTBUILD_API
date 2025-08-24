-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `type_invoicebase` ENUM('project', 'estimate') NULL DEFAULT 'project';
