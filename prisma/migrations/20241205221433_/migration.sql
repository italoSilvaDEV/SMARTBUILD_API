/*
  Warnings:

  - Made the column `user_service_project_id` on table `user_attendance` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `user_attendance` DROP FOREIGN KEY `user_attendance_user_service_project_id_fkey`;

-- AlterTable
ALTER TABLE `user_attendance` MODIFY `user_service_project_id` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `user_attendance` ADD CONSTRAINT `user_attendance_user_service_project_id_fkey` FOREIGN KEY (`user_service_project_id`) REFERENCES `user_service_project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
