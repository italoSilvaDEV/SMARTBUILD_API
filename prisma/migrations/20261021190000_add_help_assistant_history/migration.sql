-- CreateTable
CREATE TABLE `help_assistant_threads` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `help_assistant_threads_companyId_userId_lastMessageAt_idx`(`companyId`, `userId`, `lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `help_assistant_messages` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `content` TEXT NOT NULL,
    `report` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `help_assistant_messages_threadId_createdAt_idx`(`threadId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `help_assistant_messages` ADD CONSTRAINT `help_assistant_messages_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `help_assistant_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

