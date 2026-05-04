-- AlterTable
ALTER TABLE `project` ADD COLUMN `quickbooksCustomerId` VARCHAR(191) NULL,
    ADD COLUMN `quickbooksSyncToken` VARCHAR(191) NULL,
    ADD COLUMN `quickbooksUpdatedAt` DATETIME(3) NULL;
