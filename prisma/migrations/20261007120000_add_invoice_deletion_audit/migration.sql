CREATE TABLE `invoice_deletion_audit` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `estimateId` VARCHAR(191) NULL,
    `deletedById` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `invoiceNumber` VARCHAR(191) NULL,
    `invoiceType` VARCHAR(191) NOT NULL,
    `invoiceStatus` VARCHAR(191) NOT NULL,
    `invoiceAmount` DECIMAL(65,30) NOT NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `paymentAmount` DOUBLE NULL,
    `paymentPaidAt` DATETIME(3) NULL,

    INDEX `invoice_deletion_audit_invoiceId_idx`(`invoiceId`),
    INDEX `invoice_deletion_audit_companyId_deletedAt_idx`(`companyId`, `deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
