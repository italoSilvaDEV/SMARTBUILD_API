-- Create table for employee time card edit requests
CREATE TABLE `timecard_edit_requests` (
  `id` VARCHAR(191) NOT NULL,
  `attendanceId` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `reviewerId` VARCHAR(191) NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `originalCheckInTime` DATETIME(3) NOT NULL,
  `originalCheckOutTime` DATETIME(3) NULL,
  `requestedCheckInTime` DATETIME(3) NOT NULL,
  `requestedCheckOutTime` DATETIME(3) NULL,
  `approvedCheckInTime` DATETIME(3) NULL,
  `approvedCheckOutTime` DATETIME(3) NULL,
  `reason` TEXT NOT NULL,
  `employeeNote` TEXT NULL,
  `managerNote` TEXT NULL,
  `employeeSignature` TEXT NOT NULL,
  `managerSignature` TEXT NULL,
  `status` ENUM('pending', 'approved', 'denied') NOT NULL DEFAULT 'pending',
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `timecard_edit_requests_companyId_status_idx`(`companyId`, `status`),
  INDEX `timecard_edit_requests_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
  INDEX `timecard_edit_requests_attendanceId_idx`(`attendanceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `timecard_edit_requests`
  ADD CONSTRAINT `timecard_edit_requests_attendanceId_fkey`
  FOREIGN KEY (`attendanceId`) REFERENCES `user_attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `timecard_edit_requests`
  ADD CONSTRAINT `timecard_edit_requests_employeeId_fkey`
  FOREIGN KEY (`employeeId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `timecard_edit_requests`
  ADD CONSTRAINT `timecard_edit_requests_reviewerId_fkey`
  FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `timecard_edit_requests`
  ADD CONSTRAINT `timecard_edit_requests_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
