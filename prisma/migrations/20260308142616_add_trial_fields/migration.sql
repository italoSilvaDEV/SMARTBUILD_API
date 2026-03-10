-- AlterTable
ALTER TABLE `Plan` ADD COLUMN `trialDays` INTEGER NULL;

-- AlterTable
ALTER TABLE `Subscription` ADD COLUMN `cancelRequested` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `stripeStatus` VARCHAR(191) NULL,
    ADD COLUMN `trialEndDate` DATETIME(3) NULL;
