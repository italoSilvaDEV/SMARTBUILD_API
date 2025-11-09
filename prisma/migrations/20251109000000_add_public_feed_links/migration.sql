-- CreateTable
CREATE TABLE `PublicFeedLink` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NULL,
    `accessCount` INTEGER NOT NULL DEFAULT 0,
    `lastAccessAt` DATETIME(3) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PublicFeedLink_token_key`(`token`),
    INDEX `PublicFeedLink_token_idx`(`token`),
    INDEX `PublicFeedLink_projectId_idx`(`projectId`),
    INDEX `PublicFeedLink_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PublicFeedLink` ADD CONSTRAINT `PublicFeedLink_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicFeedLink` ADD CONSTRAINT `PublicFeedLink_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON UPDATE CASCADE;

