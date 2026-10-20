-- AlterTable
ALTER TABLE `chats` ADD COLUMN `externalPrivateKey` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Activities` ADD COLUMN `externalAccessId` VARCHAR(191) NULL,
    ADD COLUMN `externalAuthorId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `subcontractor_accesses` ADD COLUMN `expoPushToken` VARCHAR(191) NULL,
    ADD COLUMN `pushTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `pushTokenLeaseId` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `chat_external_members` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NOT NULL,
    `accessId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReadAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `archivedAt` DATETIME(3) NULL,
    `removedAt` DATETIME(3) NULL,

    INDEX `chat_external_members_participantId_accessId_idx`(`participantId`, `accessId`),
    UNIQUE INDEX `chat_external_members_chatId_accessId_key`(`chatId`, `accessId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_external_messages` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `senderMemberId` VARCHAR(191) NOT NULL,
    `text` TEXT NULL,
    `fileUrl` TEXT NULL,
    `fileName` VARCHAR(191) NULL,
    `fileType` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_external_messages_chatId_createdAt_idx`(`chatId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feed_external_comments` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NOT NULL,
    `accessId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feed_external_comments_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feed_external_likes` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NOT NULL,
    `accessId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `feed_external_likes_activityId_participantId_key`(`activityId`, `participantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `chats_externalPrivateKey_key` ON `chats`(`externalPrivateKey`);

-- CreateIndex
CREATE INDEX `Activities_externalAuthorId_externalAccessId_idx` ON `Activities`(`externalAuthorId`, `externalAccessId`);

-- AddForeignKey
ALTER TABLE `Activities` ADD CONSTRAINT `Activities_externalAuthorId_fkey` FOREIGN KEY (`externalAuthorId`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activities` ADD CONSTRAINT `Activities_externalAccessId_fkey` FOREIGN KEY (`externalAccessId`) REFERENCES `subcontractor_accesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_external_members` ADD CONSTRAINT `chat_external_members_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `chats`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_external_members` ADD CONSTRAINT `chat_external_members_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_external_members` ADD CONSTRAINT `chat_external_members_accessId_fkey` FOREIGN KEY (`accessId`) REFERENCES `subcontractor_accesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_external_messages` ADD CONSTRAINT `chat_external_messages_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `chats`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_external_messages` ADD CONSTRAINT `chat_external_messages_senderMemberId_fkey` FOREIGN KEY (`senderMemberId`) REFERENCES `chat_external_members`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_external_comments` ADD CONSTRAINT `feed_external_comments_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_external_comments` ADD CONSTRAINT `feed_external_comments_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_external_comments` ADD CONSTRAINT `feed_external_comments_accessId_fkey` FOREIGN KEY (`accessId`) REFERENCES `subcontractor_accesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_external_likes` ADD CONSTRAINT `feed_external_likes_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_external_likes` ADD CONSTRAINT `feed_external_likes_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_external_likes` ADD CONSTRAINT `feed_external_likes_accessId_fkey` FOREIGN KEY (`accessId`) REFERENCES `subcontractor_accesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
