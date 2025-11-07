-- DropForeignKey
ALTER TABLE `feed_comment` DROP FOREIGN KEY `feed_comment_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `feed_like` DROP FOREIGN KEY `feed_like_userId_fkey`;

-- DropForeignKey
ALTER TABLE `feed_notification` DROP FOREIGN KEY `feed_notification_userId_fkey`;

-- CreateTable
CREATE TABLE `project_files` (
    `id` VARCHAR(191) NOT NULL,
    `file` VARCHAR(191) NOT NULL,
    `name` TEXT NULL,
    `description` TEXT NULL,
    `pasteId` VARCHAR(191) NULL,
    `userAuthorId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_pastes` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `userAuthorId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feed_comment` ADD CONSTRAINT `feed_comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_like` ADD CONSTRAINT `feed_like_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feed_notification` ADD CONSTRAINT `feed_notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_files` ADD CONSTRAINT `project_files_pasteId_fkey` FOREIGN KEY (`pasteId`) REFERENCES `project_pastes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_files` ADD CONSTRAINT `project_files_userAuthorId_fkey` FOREIGN KEY (`userAuthorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_files` ADD CONSTRAINT `project_files_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_pastes` ADD CONSTRAINT `project_pastes_userAuthorId_fkey` FOREIGN KEY (`userAuthorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_pastes` ADD CONSTRAINT `project_pastes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
