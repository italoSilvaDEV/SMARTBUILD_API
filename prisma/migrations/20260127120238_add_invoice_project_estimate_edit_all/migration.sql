-- AlterTable
ALTER TABLE `User` ADD COLUMN `estimateEditAll` BOOLEAN NULL DEFAULT false,
    ADD COLUMN `invoiceEditAll` BOOLEAN NULL DEFAULT false,
    ADD COLUMN `projectEditAll` BOOLEAN NULL DEFAULT false;
