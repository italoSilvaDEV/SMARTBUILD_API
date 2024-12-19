/*
  Warnings:

  - You are about to drop the column `projectId` on the `GalleryAfter` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `GalleryBefore` table. All the data in the column will be lost.
  - You are about to drop the `ProjectStages` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `GalleryAfter` DROP FOREIGN KEY `GalleryAfter_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `GalleryBefore` DROP FOREIGN KEY `GalleryBefore_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `ProjectStages` DROP FOREIGN KEY `ProjectStages_id_user_update_fkey`;

-- DropForeignKey
ALTER TABLE `ProjectStages` DROP FOREIGN KEY `ProjectStages_projectId_fkey`;

-- AlterTable
ALTER TABLE `GalleryAfter` DROP COLUMN `projectId`,
    ADD COLUMN `serviceProjectId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `GalleryBefore` DROP COLUMN `projectId`,
    ADD COLUMN `serviceProjectId` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `ProjectStages`;

-- CreateTable
CREATE TABLE `ServiceStages` (
    `id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `check` BOOLEAN NOT NULL DEFAULT false,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `id_user_update` VARCHAR(191) NOT NULL,
    `serviceProjectId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ServiceStages` ADD CONSTRAINT `ServiceStages_id_user_update_fkey` FOREIGN KEY (`id_user_update`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceStages` ADD CONSTRAINT `ServiceStages_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GalleryBefore` ADD CONSTRAINT `GalleryBefore_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GalleryAfter` ADD CONSTRAINT `GalleryAfter_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
