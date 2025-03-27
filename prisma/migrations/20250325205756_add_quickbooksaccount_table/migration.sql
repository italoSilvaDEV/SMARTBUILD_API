/*
  Warnings:

  - A unique constraint covering the columns `[quickBooksAccount_id]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `quickBooksAccount_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `QuickBooksAccount` (
    `id` VARCHAR(191) NOT NULL,
    `accessToken` VARCHAR(191) NOT NULL,
    `refreshToken` VARCHAR(191) NOT NULL,
    `realmId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `user_id` VARCHAR(191) NULL,

    UNIQUE INDEX `QuickBooksAccount_realmId_key`(`realmId`),
    UNIQUE INDEX `QuickBooksAccount_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_quickBooksAccount_id_key` ON `User`(`quickBooksAccount_id`);

-- AddForeignKey
ALTER TABLE `QuickBooksAccount` ADD CONSTRAINT `QuickBooksAccount_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
