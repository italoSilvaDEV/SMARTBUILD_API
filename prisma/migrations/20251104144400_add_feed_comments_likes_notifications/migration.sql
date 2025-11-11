-- CreateTable
CREATE TABLE `feed_comment` (
    `id` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    INDEX `feed_comment_activityId_idx`(`activityId`),
    INDEX `feed_comment_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feed_like` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feed_like_activityId_idx`(`activityId`),
    INDEX `feed_like_userId_idx`(`userId`),
    UNIQUE INDEX `feed_like_activityId_userId_key`(`activityId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feed_notification` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `relatedLink` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feed_notification_userId_idx`(`userId`),
    INDEX `feed_notification_isRead_idx`(`isRead`),
    INDEX `feed_notification_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feed_comment` ADD CONSTRAINT `feed_comment_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_comment` ADD CONSTRAINT `feed_comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_like` ADD CONSTRAINT `feed_like_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_like` ADD CONSTRAINT `feed_like_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_notification` ADD CONSTRAINT `feed_notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_notification` ADD CONSTRAINT `feed_notification_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON UPDATE CASCADE ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE `feed_notification` ADD CONSTRAINT `feed_notification_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

