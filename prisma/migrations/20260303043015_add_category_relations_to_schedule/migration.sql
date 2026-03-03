-- AlterTable
ALTER TABLE `custom_service_schedule` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sub_contractor_service_project` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sub_services_project` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `user_service_project` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `sub_services_project` ADD CONSTRAINT `sub_services_project_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_service_schedule` ADD CONSTRAINT `custom_service_schedule_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_service_project` ADD CONSTRAINT `user_service_project_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sub_contractor_service_project` ADD CONSTRAINT `sub_contractor_service_project_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
