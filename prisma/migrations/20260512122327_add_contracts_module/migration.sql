-- CreateTable
CREATE TABLE `contract_number_sequence` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nextNumber` INTEGER NOT NULL DEFAULT 1000,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contract_number_sequence_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `status` ENUM('draft', 'sent', 'viewed', 'signed', 'canceled', 'expired') NOT NULL DEFAULT 'draft',
    `authType` ENUM('none', 'code') NOT NULL DEFAULT 'none',
    `authCode` VARCHAR(9) NULL,
    `publicToken` VARCHAR(191) NOT NULL,
    `expirationDays` INTEGER NOT NULL DEFAULT 7,
    `expiresAt` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `viewedAt` DATETIME(3) NULL,
    `signedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,
    `clientSignature` LONGTEXT NULL,
    `multi_emails` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `workContextId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contract_publicToken_key`(`publicToken`),
    INDEX `contract_companyId_status_idx`(`companyId`, `status`),
    INDEX `contract_clientId_idx`(`clientId`),
    INDEX `contract_workContextId_idx`(`workContextId`),
    UNIQUE INDEX `contract_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_document` (
    `id` VARCHAR(191) NOT NULL,
    `originalFileName` VARCHAR(191) NULL,
    `uri` TEXT NOT NULL,
    `preparedUri` TEXT NULL,
    `signedUri` TEXT NULL,
    `fileSize` INTEGER NULL,
    `pageCount` INTEGER NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `contractId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    INDEX `contract_document_contractId_idx`(`contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_field` (
    `id` VARCHAR(191) NOT NULL,
    `signer` ENUM('company', 'client') NOT NULL,
    `type` ENUM('signature', 'signature_date') NOT NULL,
    `pageNumber` INTEGER NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `width` DOUBLE NOT NULL,
    `height` DOUBLE NOT NULL,
    `dateValue` DATETIME(3) NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    INDEX `contract_field_contractId_idx`(`contractId`),
    INDEX `contract_field_documentId_idx`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_email_log` (
    `id` VARCHAR(191) NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` TEXT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `contractId` VARCHAR(191) NOT NULL,

    INDEX `contract_email_log_contractId_idx`(`contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_timeline` (
    `id` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,

    INDEX `contract_timeline_contractId_idx`(`contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contract_number_sequence` ADD CONSTRAINT `contract_number_sequence_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `contract_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `contract_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `contract_workContextId_fkey` FOREIGN KEY (`workContextId`) REFERENCES `work_context`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_document` ADD CONSTRAINT `contract_document_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_field` ADD CONSTRAINT `contract_field_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_field` ADD CONSTRAINT `contract_field_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `contract_document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_email_log` ADD CONSTRAINT `contract_email_log_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_timeline` ADD CONSTRAINT `contract_timeline_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
