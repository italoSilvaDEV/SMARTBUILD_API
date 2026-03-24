-- CreateTable
CREATE TABLE `worker_tracking_reminders` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NOT NULL,
    `reminderNumber` INTEGER NOT NULL,
    `triggeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,
    `restoredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `worker_tracking_reminders_companyId_userId_attendanceId_idx`(`companyId`, `userId`, `attendanceId`),
    INDEX `worker_tracking_reminders_attendanceId_triggeredAt_idx`(`attendanceId`, `triggeredAt`),
    UNIQUE INDEX `worker_tracking_reminders_attendanceId_reminderNumber_key`(`attendanceId`, `reminderNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
