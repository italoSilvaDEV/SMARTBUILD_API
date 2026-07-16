CREATE TABLE `schedule_notifications` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `serviceProjectId` VARCHAR(191) NULL,
  `subServiceId` VARCHAR(191) NULL,
  `customServiceId` VARCHAR(191) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `schedule_notifications_userId_readAt_createdAt_idx` (`userId`, `readAt`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `schedule_notifications`
  ADD CONSTRAINT `schedule_notifications_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
