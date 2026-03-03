-- AlterTable
ALTER TABLE `Plan` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `subcontractor_services` ALTER COLUMN `date_update` DROP DEFAULT;
