/*
  Warnings:

  - You are about to drop the `project_feed` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_feed_comment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_feed_reaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_feed_share` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_media` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_qr_code` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `project_feed` DROP FOREIGN KEY `project_feed_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `project_feed` DROP FOREIGN KEY `project_feed_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `project_feed_comment` DROP FOREIGN KEY `project_feed_comment_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `project_feed_comment` DROP FOREIGN KEY `project_feed_comment_projectFeedId_fkey`;

-- DropForeignKey
ALTER TABLE `project_feed_reaction` DROP FOREIGN KEY `project_feed_reaction_projectFeedId_fkey`;

-- DropForeignKey
ALTER TABLE `project_feed_reaction` DROP FOREIGN KEY `project_feed_reaction_userId_fkey`;

-- DropForeignKey
ALTER TABLE `project_feed_share` DROP FOREIGN KEY `project_feed_share_createdById_fkey`;

-- DropForeignKey
ALTER TABLE `project_feed_share` DROP FOREIGN KEY `project_feed_share_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `project_media` DROP FOREIGN KEY `project_media_projectFeedId_fkey`;

-- DropForeignKey
ALTER TABLE `project_qr_code` DROP FOREIGN KEY `project_qr_code_createdById_fkey`;

-- DropForeignKey
ALTER TABLE `project_qr_code` DROP FOREIGN KEY `project_qr_code_projectId_fkey`;

-- DropTable
DROP TABLE `project_feed`;

-- DropTable
DROP TABLE `project_feed_comment`;

-- DropTable
DROP TABLE `project_feed_reaction`;

-- DropTable
DROP TABLE `project_feed_share`;

-- DropTable
DROP TABLE `project_media`;

-- DropTable
DROP TABLE `project_qr_code`;

-- CreateTable
CREATE TABLE `worker_live_locations` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NULL,
    `userServiceProjectId` VARCHAR(191) NULL,
    `serviceProjectId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `projectName` VARCHAR(191) NULL,
    `serviceTitle` VARCHAR(191) NULL,
    `projectLatitude` DOUBLE NULL,
    `projectLongitude` DOUBLE NULL,
    `projectRadiusMeters` DOUBLE NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `accuracyMeters` DOUBLE NULL,
    `speedMetersPerSecond` DOUBLE NULL,
    `headingDegrees` DOUBLE NULL,
    `batteryLevel` DOUBLE NULL,
    `isInsideSite` BOOLEAN NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'mobile',
    `recordedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `worker_live_locations_companyId_recordedAt_idx`(`companyId`, `recordedAt`),
    INDEX `worker_live_locations_userId_recordedAt_idx`(`userId`, `recordedAt`),
    UNIQUE INDEX `worker_live_locations_companyId_userId_key`(`companyId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `worker_location_pings` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NULL,
    `userServiceProjectId` VARCHAR(191) NULL,
    `serviceProjectId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `projectName` VARCHAR(191) NULL,
    `serviceTitle` VARCHAR(191) NULL,
    `projectLatitude` DOUBLE NULL,
    `projectLongitude` DOUBLE NULL,
    `projectRadiusMeters` DOUBLE NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `accuracyMeters` DOUBLE NULL,
    `speedMetersPerSecond` DOUBLE NULL,
    `headingDegrees` DOUBLE NULL,
    `batteryLevel` DOUBLE NULL,
    `isInsideSite` BOOLEAN NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'mobile',
    `recordedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `worker_location_pings_companyId_recordedAt_idx`(`companyId`, `recordedAt`),
    INDEX `worker_location_pings_companyId_userId_recordedAt_idx`(`companyId`, `userId`, `recordedAt`),
    INDEX `worker_location_pings_userId_recordedAt_idx`(`userId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `worker_live_locations` ADD CONSTRAINT `worker_live_locations_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worker_live_locations` ADD CONSTRAINT `worker_live_locations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worker_location_pings` ADD CONSTRAINT `worker_location_pings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worker_location_pings` ADD CONSTRAINT `worker_location_pings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
