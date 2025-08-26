-- AlterTable
ALTER TABLE `QuickBooksAccount` ADD COLUMN `businessType` VARCHAR(191) NULL,
    ADD COLUMN `companyAddress` TEXT NULL,
    ADD COLUMN `companyEmail` VARCHAR(191) NULL,
    ADD COLUMN `companyPhone` VARCHAR(191) NULL,
    ADD COLUMN `isDisabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `taxIdentifier` VARCHAR(191) NULL;
