-- AlterTable
ALTER TABLE `worked_hours` ADD COLUMN `fixed_price` DECIMAL(65, 30) NULL,
    ADD COLUMN `type_price` ENUM('hourly', 'fixed') NULL DEFAULT 'hourly',
    MODIFY `hourly_price` DECIMAL(65, 30) NULL;