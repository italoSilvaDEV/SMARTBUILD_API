-- AlterTable
ALTER TABLE `Estimate` ADD COLUMN `discountAmount` DECIMAL(65, 30) NULL,
    ADD COLUMN `discountType` ENUM('fixed', 'percentage') NULL,
    ADD COLUMN `discountValue` DECIMAL(65, 30) NULL,
    ADD COLUMN `finalAmount` DECIMAL(65, 30) NULL;

-- AlterTable
ALTER TABLE `EstimateServiceProject` ADD COLUMN `originalLineTotal` DECIMAL(65, 30) NULL,
    ADD COLUMN `originalUnitPrice` DECIMAL(65, 30) NULL;
