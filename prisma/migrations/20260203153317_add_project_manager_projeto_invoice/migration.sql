-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `project_manager_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `project` ADD COLUMN `project_manager_id` VARCHAR(191) NULL;

-- -- CreateTable
-- CREATE TABLE `task_comments` (
--     `id` VARCHAR(191) NOT NULL,
--     `text` TEXT NOT NULL,
--     `taskId` VARCHAR(191) NOT NULL,
--     `authorId` VARCHAR(191) NOT NULL,
--     `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
--     `updatedAt` DATETIME(3) NOT NULL,

--     INDEX `task_comments_taskId_idx`(`taskId`),
--     INDEX `task_comments_authorId_idx`(`authorId`),
--     PRIMARY KEY (`id`)
-- ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; 

-- -- CreateTable
-- CREATE TABLE `task_notifications` (
--     `id` VARCHAR(191) NOT NULL,
--     `type` VARCHAR(191) NOT NULL,
--     `message` TEXT NOT NULL,
--     `isRead` BOOLEAN NOT NULL DEFAULT false,
--     `taskId` VARCHAR(191) NOT NULL,
--     `userId` VARCHAR(191) NOT NULL,
--     `actorId` VARCHAR(191) NULL,
--     `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

--     INDEX `task_notifications_userId_idx`(`userId`),
--     INDEX `task_notifications_taskId_idx`(`taskId`),
--     PRIMARY KEY (`id`)
-- ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_project_manager_id_fkey` FOREIGN KEY (`project_manager_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_project_manager_id_fkey` FOREIGN KEY (`project_manager_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE `task_notifications` ADD CONSTRAINT `task_notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- -- AddForeignKey
-- ALTER TABLE `task_notifications` ADD CONSTRAINT `task_notifications_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
