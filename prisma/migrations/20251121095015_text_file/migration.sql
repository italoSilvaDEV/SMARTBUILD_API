-- AlterTable
ALTER TABLE `project_files` ADD COLUMN `type_file` ENUM('text', 'others') NOT NULL DEFAULT 'others',
    MODIFY `file` VARCHAR(191) NULL;