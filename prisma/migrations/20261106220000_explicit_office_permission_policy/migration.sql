-- Preserve only the already-existing empty-role behavior. New roles default to deny.
ALTER TABLE `Office` ADD COLUMN `legacyPlanPermissions` BOOLEAN NOT NULL DEFAULT false;
UPDATE `Office` SET `legacyPlanPermissions` = true;
