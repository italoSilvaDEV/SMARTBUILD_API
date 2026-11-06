CREATE TABLE `AccountDeletionRequest` (
    `id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `locale` VARCHAR(2) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending_verification',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AccountDeletionRequest_status_createdAt_idx` (`status`, `createdAt`),
    INDEX `AccountDeletionRequest_email_idx` (`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
