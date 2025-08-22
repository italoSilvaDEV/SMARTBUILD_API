-- AlterTable
ALTER TABLE `Estimate` ADD COLUMN `type_estimate` ENUM('estimate', 'estimateProject') NULL DEFAULT 'estimateProject';
