-- Add attendance mode to company configuration
ALTER TABLE `Company`
  ADD COLUMN `attendanceMode` ENUM('manual','auto') NOT NULL DEFAULT 'manual';
