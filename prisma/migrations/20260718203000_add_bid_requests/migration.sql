-- CreateTable
CREATE TABLE `bid_request_number_sequence` (
    `companyId` VARCHAR(191) NOT NULL,
    `nextNumber` INTEGER NOT NULL DEFAULT 1001,

    PRIMARY KEY (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bid_request` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `status` ENUM('pending', 'finalized', 'canceled') NOT NULL DEFAULT 'pending',
    `title` VARCHAR(191) NOT NULL,
    `scope` TEXT NOT NULL,
    `responseDeadline` DATETIME(3) NOT NULL,
    `externalFolderUrl` TEXT NULL,
    `customMessage` TEXT NULL,
    `projectNumber` VARCHAR(191) NULL,
    `projectName` VARCHAR(191) NOT NULL,
    `projectAddress` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `finalizedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,
    `approvedRecipientId` VARCHAR(191) NULL,
    `approvedWorkOrderId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,

    INDEX `bid_request_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `bid_request_projectId_idx`(`projectId`),
    UNIQUE INDEX `bid_request_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bid_request_item` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 1,
    `suggestedValue` DECIMAL(14, 2) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `bidRequestId` VARCHAR(191) NOT NULL,

    INDEX `bid_request_item_bidRequestId_position_idx`(`bidRequestId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bid_request_recipient` (
    `id` VARCHAR(191) NOT NULL,
    `publicToken` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'submitted', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
    `subcontractorName` VARCHAR(191) NOT NULL,
    `subcontractorEmail` VARCHAR(191) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `bidRequestId` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `bid_request_recipient_publicToken_key`(`publicToken`),
    INDEX `bid_request_recipient_bidRequestId_status_idx`(`bidRequestId`, `status`),
    INDEX `bid_request_recipient_subcontractorId_idx`(`subcontractorId`),
    UNIQUE INDEX `bid_request_recipient_bidRequestId_subcontractorId_key`(`bidRequestId`, `subcontractorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bid_proposal_item` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isCustom` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `sourceItemId` VARCHAR(191) NULL,

    INDEX `bid_proposal_item_recipientId_position_idx`(`recipientId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bid_request_attachment` (
    `id` VARCHAR(191) NOT NULL,
    `key` TEXT NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `contentType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `bidRequestId` VARCHAR(191) NOT NULL,

    INDEX `bid_request_attachment_bidRequestId_idx`(`bidRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bid_request_number_sequence` ADD CONSTRAINT `bid_request_number_sequence_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bid_request` ADD CONSTRAINT `bid_request_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bid_request` ADD CONSTRAINT `bid_request_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bid_request_item` ADD CONSTRAINT `bid_request_item_bidRequestId_fkey` FOREIGN KEY (`bidRequestId`) REFERENCES `bid_request`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bid_request_recipient` ADD CONSTRAINT `bid_request_recipient_bidRequestId_fkey` FOREIGN KEY (`bidRequestId`) REFERENCES `bid_request`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bid_request_recipient` ADD CONSTRAINT `bid_request_recipient_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `subcontractors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bid_proposal_item` ADD CONSTRAINT `bid_proposal_item_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `bid_request_recipient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bid_request_attachment` ADD CONSTRAINT `bid_request_attachment_bidRequestId_fkey` FOREIGN KEY (`bidRequestId`) REFERENCES `bid_request`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
