-- AlterTable
ALTER TABLE `QuickBooksAccount` ADD COLUMN `needsReauthorization` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `scopes` TEXT NULL;
