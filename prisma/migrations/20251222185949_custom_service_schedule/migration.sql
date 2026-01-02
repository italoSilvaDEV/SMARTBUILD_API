/*
  Warnings:

  - A unique constraint covering the columns `[subcontractor_id,custom_service_schedule_id]` on the table `sub_contractor_service_project` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,custom_service_schedule_id]` on the table `user_service_project` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `ServiceProject` ADD COLUMN `scheduleCompleted` BOOLEAN NULL DEFAULT false;

-- AlterTable
ALTER TABLE `sub_contractor_service_project` ADD COLUMN `custom_service_schedule_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sub_services_project` ADD COLUMN `custom_service_schedule_id` VARCHAR(191) NULL,
    ADD COLUMN `scheduleCompleted` BOOLEAN NULL DEFAULT false;

-- AlterTable
ALTER TABLE `user_service_project` ADD COLUMN `custom_service_schedule_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `custom_service_schedule` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `start_date` VARCHAR(191) NULL,
    `deadline` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `scheduleCompleted` BOOLEAN NULL DEFAULT false,
    `projectId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `sub_contractor_service_project_custom_schedule_id_fkey` ON `sub_contractor_service_project`(`custom_service_schedule_id`);

-- CreateIndex
CREATE UNIQUE INDEX `sub_contractor_service_project_unique_custom_schedule` ON `sub_contractor_service_project`(`subcontractor_id`, `custom_service_schedule_id`);

-- CreateIndex
CREATE INDEX `user_service_project_custom_schedule_id_fkey` ON `user_service_project`(`custom_service_schedule_id`);

-- CreateIndex
CREATE UNIQUE INDEX `user_service_project_unique_custom_schedule` ON `user_service_project`(`user_id`, `custom_service_schedule_id`);

-- AddForeignKey
ALTER TABLE `sub_services_project` ADD CONSTRAINT `sub_services_project_custom_service_schedule_id_fkey` FOREIGN KEY (`custom_service_schedule_id`) REFERENCES `custom_service_schedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_service_schedule` ADD CONSTRAINT `custom_service_schedule_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_service_project` ADD CONSTRAINT `user_service_project_custom_service_schedule_id_fkey` FOREIGN KEY (`custom_service_schedule_id`) REFERENCES `custom_service_schedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sub_contractor_service_project` ADD CONSTRAINT `sub_contractor_service_project_custom_service_schedule_id_fkey` FOREIGN KEY (`custom_service_schedule_id`) REFERENCES `custom_service_schedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;