-- AlterTable
ALTER TABLE `user_attendance` ADD COLUMN `pending_project_address` VARCHAR(191) NULL,
    ADD COLUMN `pending_project_id` VARCHAR(191) NULL,
    ADD COLUMN `pending_project_latitude` DOUBLE NULL,
    ADD COLUMN `pending_project_longitude` DOUBLE NULL,
    ADD COLUMN `pending_project_name` VARCHAR(191) NULL,
    ADD COLUMN `pending_project_radius` DOUBLE NULL,
    ADD COLUMN `service_selection_status` ENUM('pending', 'selected') NOT NULL DEFAULT 'selected',
    MODIFY `user_service_project_id` VARCHAR(191) NULL;
