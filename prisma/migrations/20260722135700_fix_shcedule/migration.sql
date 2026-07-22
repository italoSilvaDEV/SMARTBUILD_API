-- AlterTable
ALTER TABLE `sub_contractor_service_project` ADD COLUMN `removed_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `user_service_project` ADD COLUMN `removed_at` DATETIME(3) NULL;