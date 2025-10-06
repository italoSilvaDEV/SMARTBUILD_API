-- CreateTable
CREATE TABLE `quickbooks_config` (
    `id` VARCHAR(191) NOT NULL,
    `configType` ENUM('INVOICE_CREATION') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `companyId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quickbooks_config_configType_companyId_key`(`configType`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `quickbooks_config` ADD CONSTRAINT `quickbooks_config_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
