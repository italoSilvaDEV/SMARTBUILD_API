-- CreateTable
CREATE TABLE `contract_terms` (
    `id` VARCHAR(191) NOT NULL,
    `terms` TEXT NULL,
    `contractTermsType` ENUM('letter', 'termseconditions') NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contract_terms_contractTermsType_companyId_key`(`contractTermsType`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contract_terms` ADD CONSTRAINT `contract_terms_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
