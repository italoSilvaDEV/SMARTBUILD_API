-- DropForeignKey
ALTER TABLE `timecard_edit_requests` DROP FOREIGN KEY `timecard_edit_requests_attendanceId_fkey`;

-- AlterTable
ALTER TABLE `user_attendance` ADD COLUMN `note` TEXT NULL;

-- AlterTable
ALTER TABLE `timecard_edit_requests` ADD COLUMN `approvedAttendanceNote` TEXT NULL,
    ADD COLUMN `clientRequestId` VARCHAR(191) NULL,
    ADD COLUMN `requestType` ENUM('correction', 'missing_entry') NOT NULL DEFAULT 'correction',
    ADD COLUMN `serviceProjectId` VARCHAR(191) NULL,
    MODIFY `attendanceId` VARCHAR(191) NULL,
    MODIFY `originalCheckInTime` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `timecard_edit_requests_serviceProjectId_idx` ON `timecard_edit_requests`(`serviceProjectId`);

-- CreateIndex
CREATE UNIQUE INDEX `timecard_edit_requests_employeeId_clientRequestId_key` ON `timecard_edit_requests`(`employeeId`, `clientRequestId`);

-- AddForeignKey
ALTER TABLE `timecard_edit_requests` ADD CONSTRAINT `timecard_edit_requests_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `user_attendance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timecard_edit_requests` ADD CONSTRAINT `timecard_edit_requests_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
