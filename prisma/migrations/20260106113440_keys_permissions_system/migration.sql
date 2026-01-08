-- CreateTable
CREATE TABLE `permission_user_key` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions_keys` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `status` ENUM('pending', 'approved', 'revoked') NOT NULL DEFAULT 'pending',
    `date_request` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_approved` DATETIME(3) NULL,
    `date_revoked` DATETIME(3) NULL,
    `permissionUserKeyId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `permissions_keys_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `master_actions_history` (
    `id` VARCHAR(191) NOT NULL,
    `action` TEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `targetName` TEXT NULL,
    `targetContact` TEXT NULL,
    `userPermissionId` VARCHAR(191) NOT NULL,
    `userPermissionKeyId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `permissions_keys` ADD CONSTRAINT `permissions_keys_permissionUserKeyId_fkey` FOREIGN KEY (`permissionUserKeyId`) REFERENCES `permission_user_key`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `master_actions_history` ADD CONSTRAINT `master_actions_history_userPermissionId_fkey` FOREIGN KEY (`userPermissionId`) REFERENCES `permission_user_key`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `master_actions_history` ADD CONSTRAINT `master_actions_history_userPermissionKeyId_fkey` FOREIGN KEY (`userPermissionKeyId`) REFERENCES `permissions_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
