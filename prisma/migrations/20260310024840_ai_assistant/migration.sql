-- CreateTable
CREATE TABLE `ai_assistant_threads` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ai_assistant_threads_companyId_userId_lastMessageAt_idx`(`companyId`, `userId`, `lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_assistant_messages` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `role` ENUM('user', 'assistant', 'system') NOT NULL,
    `content` TEXT NOT NULL,
    `report` JSON NULL,
    `toolsUsed` JSON NULL,
    `toolData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_assistant_messages_threadId_createdAt_idx`(`threadId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_assistant_threads` ADD CONSTRAINT `ai_assistant_threads_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_assistant_threads` ADD CONSTRAINT `ai_assistant_threads_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_assistant_messages` ADD CONSTRAINT `ai_assistant_messages_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ai_assistant_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
