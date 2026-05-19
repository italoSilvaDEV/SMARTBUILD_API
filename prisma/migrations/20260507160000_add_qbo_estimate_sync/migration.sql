-- AlterTable
ALTER TABLE `Estimate` ADD COLUMN `idQuickbooks` VARCHAR(191) NULL,
    ADD COLUMN `quickbooksRaw` JSON NULL,
    ADD COLUMN `quickbooksSyncToken` VARCHAR(191) NULL,
    ADD COLUMN `quickbooksUpdatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `sync_preferences` MODIFY `typesEntity` ENUM('customers', 'projects', 'estimates', 'invoices', 'payments') NOT NULL;

-- AlterTable
ALTER TABLE `sync_status` MODIFY `entity` ENUM('customers', 'projects', 'estimates', 'invoices', 'payments') NOT NULL;

-- AlterTable
ALTER TABLE `sync_execution` MODIFY `entity` ENUM('customers', 'projects', 'estimates', 'invoices', 'payments') NOT NULL;
