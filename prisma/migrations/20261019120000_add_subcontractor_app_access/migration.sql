-- CreateTable
CREATE TABLE `subcontractor_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `isDisabled` BOOLEAN NOT NULL DEFAULT false,
    `sessionVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subcontractor_accounts_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subcontractor_accesses` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `version` INTEGER NOT NULL DEFAULT 1,
    `grantedById` VARCHAR(191) NOT NULL,
    `revokedById` VARCHAR(191) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `subcontractor_accesses_subcontractorId_status_idx`(`subcontractorId`, `status`),
    UNIQUE INDEX `subcontractor_accesses_accountId_subcontractorId_key`(`accountId`, `subcontractorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subcontractor_invites` (
    `id` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `deliveryStatus` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `invitedById` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subcontractor_invites_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `subcontractor_invites_subcontractorId_email_key`(`subcontractorId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participants` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('internal', 'subcontractor') NOT NULL,
    `userId` VARCHAR(191) NULL,
    `subcontractorAccountId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `participants_userId_key`(`userId`),
    UNIQUE INDEX `participants_subcontractorAccountId_key`(`subcontractorAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subcontractor_accesses` ADD CONSTRAINT `subcontractor_accesses_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `subcontractor_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_accesses` ADD CONSTRAINT `subcontractor_accesses_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `subcontractors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractor_invites` ADD CONSTRAINT `subcontractor_invites_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `subcontractors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `participants` ADD CONSTRAINT `participants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `participants` ADD CONSTRAINT `participants_subcontractorAccountId_fkey` FOREIGN KEY (`subcontractorAccountId`) REFERENCES `subcontractor_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only new tables are constrained; no legacy rows are rewritten.
-- MySQL 8.0.16+ enforces CHECK constraints.
ALTER TABLE `participants` ADD CONSTRAINT `participants_identity_check` CHECK (
    (`type` = 'internal' AND `userId` IS NOT NULL AND `subcontractorAccountId` IS NULL)
    OR (`type` = 'subcontractor' AND `userId` IS NULL AND `subcontractorAccountId` IS NOT NULL)
);
ALTER TABLE `subcontractor_accesses` ADD CONSTRAINT `subcontractor_access_status_check` CHECK (`status` IN ('active', 'revoked'));
ALTER TABLE `subcontractor_invites` ADD CONSTRAINT `subcontractor_invite_status_check` CHECK (`status` IN ('pending', 'accepted', 'revoked'));
ALTER TABLE `subcontractor_invites` ADD CONSTRAINT `subcontractor_invite_delivery_check` CHECK (`deliveryStatus` IN ('pending', 'sent', 'failed'));
