-- AlterTable
ALTER TABLE `worked_hours` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
