/*
  Warnings:

  - You are about to drop the column `errorRecords` on the `sync_status` table. All the data in the column will be lost.
  - You are about to drop the column `processedRecords` on the `sync_status` table. All the data in the column will be lost.
  - You are about to drop the column `successRecords` on the `sync_status` table. All the data in the column will be lost.
  - You are about to drop the column `totalRecords` on the `sync_status` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `sync_log` ADD COLUMN `syncExecutionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sync_status` DROP COLUMN `errorRecords`,
    DROP COLUMN `processedRecords`,
    DROP COLUMN `successRecords`,
    DROP COLUMN `totalRecords`;

-- CreateTable
CREATE TABLE `sync_execution` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `entity` ENUM('customers', 'invoices', 'payments') NOT NULL,
    `syncType` ENUM('bidirectional', 'QuickBooksToSmartBuild', 'SmartBuildToQuickBooks') NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PAUSED') NOT NULL DEFAULT 'PENDING',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `duration` INTEGER NULL,
    `totalRecords` INTEGER NOT NULL DEFAULT 0,
    `processedRecords` INTEGER NOT NULL DEFAULT 0,
    `successRecords` INTEGER NOT NULL DEFAULT 0,
    `errorRecords` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `triggerType` VARCHAR(191) NULL,
    `jobId` VARCHAR(191) NULL,
    `details` JSON NULL,
    `syncStatusId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sync_log` ADD CONSTRAINT `sync_log_syncExecutionId_fkey` FOREIGN KEY (`syncExecutionId`) REFERENCES `sync_execution`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_execution` ADD CONSTRAINT `sync_execution_syncStatusId_fkey` FOREIGN KEY (`syncStatusId`) REFERENCES `sync_status`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
