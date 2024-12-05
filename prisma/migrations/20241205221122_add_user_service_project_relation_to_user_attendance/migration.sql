-- AlterTable
ALTER TABLE `user_attendance` ADD COLUMN `user_service_project_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `user_attendance_user_service_project_id_fkey` ON `user_attendance`(`user_service_project_id`);

-- AddForeignKey
ALTER TABLE `user_attendance` ADD CONSTRAINT `user_attendance_user_service_project_id_fkey` FOREIGN KEY (`user_service_project_id`) REFERENCES `user_service_project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
