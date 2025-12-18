/*
  Warnings:

  - A unique constraint covering the columns `[user_id,sub_service_project_id]` on the table `user_service_project` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `user_service_project` ADD COLUMN `sub_service_project_id` VARCHAR(191) NULL,
    MODIFY `service_project_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `sub_services_project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `price` DECIMAL(65, 30) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `start_date` VARCHAR(191) NULL,
    `deadline` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `serviceProjectId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `user_service_project_sub_service_project_id_fkey` ON `user_service_project`(`sub_service_project_id`);

-- CreateIndex
CREATE UNIQUE INDEX `user_service_project_unique_sub_service_unique` ON `user_service_project`(`user_id`, `sub_service_project_id`);

-- AddForeignKey
ALTER TABLE `sub_services_project` ADD CONSTRAINT `sub_services_project_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_service_project` ADD CONSTRAINT `user_service_project_sub_service_project_id_fkey` FOREIGN KEY (`sub_service_project_id`) REFERENCES `sub_services_project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;