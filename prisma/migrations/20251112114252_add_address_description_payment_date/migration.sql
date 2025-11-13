-- AlterTable
ALTER TABLE `subcontractors` ADD COLUMN `address` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `worked_hours` ADD COLUMN `description` VARCHAR(191) NULL,
    ADD COLUMN `payment_date` DATETIME(3) NULL;
