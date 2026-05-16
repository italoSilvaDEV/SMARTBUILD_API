-- AlterTable
ALTER TABLE `Contract` ADD COLUMN `clientSignatureFontKey` VARCHAR(64) NOT NULL DEFAULT 'classic',
    ADD COLUMN `companySignatureFontKey` VARCHAR(64) NOT NULL DEFAULT 'classic';
