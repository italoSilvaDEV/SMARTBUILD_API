-- AlterTable
ALTER TABLE `Estimate` ADD COLUMN `depositAmount` DECIMAL(65, 30) NULL,
    ADD COLUMN `depositType` ENUM('fixed', 'percentage') NULL,
    ADD COLUMN `depositValue` DECIMAL(65, 30) NULL,
    ADD COLUMN `markupAmount` DECIMAL(65, 30) NULL,
    ADD COLUMN `markupType` ENUM('fixed', 'percentage') NULL,
    ADD COLUMN `markupValue` DECIMAL(65, 30) NULL;