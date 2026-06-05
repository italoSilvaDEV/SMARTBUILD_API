-- AlterTable
ALTER TABLE `User` ADD COLUMN `manualBreakEnabled` BOOLEAN NULL DEFAULT false;

-- CreateTable
CREATE TABLE `user_attendance_break` (
    `id` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_attendance_break_attendance_id_fkey`(`attendanceId`),
    INDEX `user_attendance_break_user_day_idx`(`userId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_attendance_break` ADD CONSTRAINT `user_attendance_break_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `user_attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_attendance_break` ADD CONSTRAINT `user_attendance_break_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
