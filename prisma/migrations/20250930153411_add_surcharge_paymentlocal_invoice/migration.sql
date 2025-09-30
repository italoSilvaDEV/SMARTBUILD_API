-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `surchargePaymentLocal` DECIMAL(65, 30) NULL,
    ADD COLUMN `surchargePaymentStripe` DECIMAL(65, 30) NULL;
