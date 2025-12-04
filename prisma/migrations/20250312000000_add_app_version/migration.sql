-- CreateTable
CREATE TABLE `app_version` (
    `id` VARCHAR(191) NOT NULL,
    `minimumVersion` VARCHAR(191) NOT NULL,
    `currentVersion` VARCHAR(191) NULL,
    `forceUpdate` BOOLEAN NOT NULL DEFAULT false,
    `message` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert default version configuration
INSERT INTO `app_version` (`id`, `minimumVersion`, `currentVersion`, `forceUpdate`, `message`, `createdAt`, `updatedAt`)
VALUES (UUID(), '1.83', '1.84', false, NULL, NOW(), NOW());

