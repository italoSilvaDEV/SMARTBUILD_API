-- CreateTable
CREATE TABLE `assistant_whatsapp_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(32) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'active',
    `openaiConversationId` VARCHAR(191) NULL,
    `lastResponseId` VARCHAR(191) NULL,
    `closedReason` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    INDEX `assistant_whatsapp_sessions_phoneNumber_status_lastActivityA_idx`(`phoneNumber`, `status`, `lastActivityAt`),
    INDEX `assistant_whatsapp_sessions_status_lastActivityAt_idx`(`status`, `lastActivityAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_whatsapp_messages` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(32) NOT NULL,
    `direction` VARCHAR(16) NOT NULL,
    `content` TEXT NOT NULL,
    `metaMessageId` VARCHAR(191) NULL,
    `rawPayload` JSON NULL,
    `toolData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `assistant_whatsapp_messages_metaMessageId_key`(`metaMessageId`),
    INDEX `assistant_whatsapp_messages_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    INDEX `assistant_whatsapp_messages_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assistant_whatsapp_messages` ADD CONSTRAINT `assistant_whatsapp_messages_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `assistant_whatsapp_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
