-- AlterTable
ALTER TABLE `Estimate` ADD COLUMN `type_estimate` ENUM('Estimate', 'estimateProject') NULL DEFAULT 'estimateProject';
