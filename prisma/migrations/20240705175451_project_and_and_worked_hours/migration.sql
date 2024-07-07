-- AlterTable
ALTER TABLE `worked_hours` ADD COLUMN `project_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
