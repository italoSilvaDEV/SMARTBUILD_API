-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `paymentMethodType` VARCHAR(191) NULL,
    ADD COLUMN `totalAmountPaid` DECIMAL(65, 30) NULL,
    ADD COLUMN `totalAmountWithSurcharge` DECIMAL(65, 30) NULL;
