-- CreateTable
CREATE TABLE `estimate_ai_session` (
    `id` VARCHAR(191) NOT NULL,
    `estimateId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `title` VARCHAR(191) NULL,
    `lastResponseId` VARCHAR(191) NULL,
    `modelSimple` VARCHAR(191) NULL,
    `modelDocument` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `estimate_ai_session_estimateId_key`(`estimateId`),
    INDEX `estimate_ai_session_companyId_idx`(`companyId`),
    INDEX `estimate_ai_session_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estimate_ai_message` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `payload` JSON NULL,
    `responseId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    INDEX `estimate_ai_message_sessionId_date_creation_idx`(`sessionId`, `date_creation`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estimate_ai_attachment` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NULL,
    `fileName` TEXT NOT NULL,
    `originalName` TEXT NOT NULL,
    `mimeType` VARCHAR(191) NULL,
    `size` INTEGER NULL,
    `s3Key` TEXT NULL,
    `extractedText` LONGTEXT NULL,
    `summary` TEXT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    INDEX `estimate_ai_attachment_sessionId_idx`(`sessionId`),
    INDEX `estimate_ai_attachment_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `estimate_ai_session` ADD CONSTRAINT `estimate_ai_session_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estimate_ai_message` ADD CONSTRAINT `estimate_ai_message_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `estimate_ai_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estimate_ai_attachment` ADD CONSTRAINT `estimate_ai_attachment_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `estimate_ai_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estimate_ai_attachment` ADD CONSTRAINT `estimate_ai_attachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `estimate_ai_message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
