-- AlterTable
ALTER TABLE `User` ADD COLUMN `neighborhood` VARCHAR(191) NULL,
    ADD COLUMN `number_home` VARCHAR(191) NULL,
    ADD COLUMN `number_road` VARCHAR(191) NULL,
    ADD COLUMN `phone_emergency` VARCHAR(191) NULL,
    ADD COLUMN `state` VARCHAR(191) NULL,
    ADD COLUMN `zip_code` VARCHAR(191) NULL;
