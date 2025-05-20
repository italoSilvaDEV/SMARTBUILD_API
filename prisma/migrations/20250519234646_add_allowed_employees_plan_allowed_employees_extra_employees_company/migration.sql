-- AlterTable
ALTER TABLE `Company` ADD COLUMN `allowedEmployees` INTEGER NULL,
    ADD COLUMN `extraEmployees` INTEGER NULL;

-- AlterTable
ALTER TABLE `Plan` ADD COLUMN `allowedEmployees` INTEGER NULL;
