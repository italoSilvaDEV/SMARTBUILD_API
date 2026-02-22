-- DropForeignKey
ALTER TABLE `sales_deal` DROP FOREIGN KEY `sales_deal_stageId_fkey`;

-- AlterTable
ALTER TABLE `worked_hours` ADD COLUMN `custom_service_schedule_id` VARCHAR(191) NULL,
    ADD COLUMN `sub_services_project_id` VARCHAR(191) NULL,
    ADD COLUMN `subcontractor_service_project_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_subcontractor_service_project_id_fkey` FOREIGN KEY (`subcontractor_service_project_id`) REFERENCES `sub_contractor_service_project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_sub_services_project_id_fkey` FOREIGN KEY (`sub_services_project_id`) REFERENCES `sub_services_project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_custom_service_schedule_id_fkey` FOREIGN KEY (`custom_service_schedule_id`) REFERENCES `custom_service_schedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_deal` ADD CONSTRAINT `sales_deal_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `sales_stage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
