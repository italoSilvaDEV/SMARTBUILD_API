-- AlterTable
ALTER TABLE `Plan` MODIFY `validityType` ENUM('FREE', 'MONTHLY', 'ANNUAL', 'CUSTOM', 'DAYS') NOT NULL;
