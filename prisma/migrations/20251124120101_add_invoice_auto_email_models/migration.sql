-- DropForeignKey
ALTER TABLE `PublicFeedLink` DROP FOREIGN KEY `PublicFeedLink_createdBy_fkey`;

-- CreateTable
CREATE TABLE `invoice_auto_email_config` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `sendBefore7Days` BOOLEAN NOT NULL DEFAULT false,
    `sendBefore3Days` BOOLEAN NOT NULL DEFAULT false,
    `sendBefore1Day` BOOLEAN NOT NULL DEFAULT false,
    `sendOnDueDate` BOOLEAN NOT NULL DEFAULT false,
    `sendAfter1Day` BOOLEAN NOT NULL DEFAULT false,
    `sendAfter3Days` BOOLEAN NOT NULL DEFAULT false,
    `sendAfter7Days` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoice_auto_email_config_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_auto_email_log` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `emailType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `invoice_auto_email_log_invoiceId_idx`(`invoiceId`),
    INDEX `invoice_auto_email_log_sentAt_idx`(`sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PublicFeedLink` ADD CONSTRAINT `PublicFeedLink_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_auto_email_config` ADD CONSTRAINT `invoice_auto_email_config_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_auto_email_log` ADD CONSTRAINT `invoice_auto_email_log_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
