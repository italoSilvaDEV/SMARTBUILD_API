ALTER TABLE `Subscription`
  ADD COLUMN `appleBillingStatus` VARCHAR(32) NULL,
  ADD COLUMN `appleLastChargedAt` DATETIME(3) NULL;
