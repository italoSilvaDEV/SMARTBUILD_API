/*
  Warnings:

  - A unique constraint covering the columns `[storeTransactionId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[googlePurchaseToken]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Company` ADD COLUMN `mobileSignupProvider` VARCHAR(32) NULL,
    ADD COLUMN `mobileSubscriptionStatus` VARCHAR(32) NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE `Subscription` ADD COLUMN `autoRenewing` BOOLEAN NULL,
    ADD COLUMN `billingProvider` ENUM('stripe', 'apple', 'google', 'free') NOT NULL DEFAULT 'stripe',
    ADD COLUMN `googlePurchaseToken` VARCHAR(512) NULL,
    ADD COLUMN `lastVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `storeEnvironment` ENUM('sandbox', 'production') NULL,
    ADD COLUMN `storeOriginalTransactionId` VARCHAR(191) NULL,
    ADD COLUMN `storeProductId` VARCHAR(191) NULL,
    ADD COLUMN `storeTransactionId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `UserAuthIdentity` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('google', 'apple') NOT NULL,
    `providerUserId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `rawProfile` JSON NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserAuthIdentity_email_idx`(`email`),
    INDEX `UserAuthIdentity_userId_idx`(`userId`),
    UNIQUE INDEX `UserAuthIdentity_provider_providerUserId_key`(`provider`, `providerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserDeviceCredential` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(32) NULL,
    `label` VARCHAR(191) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserDeviceCredential_deviceId_idx`(`deviceId`),
    INDEX `UserDeviceCredential_tokenHash_idx`(`tokenHash`),
    UNIQUE INDEX `UserDeviceCredential_userId_deviceId_key`(`userId`, `deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Subscription_storeTransactionId_key` ON `Subscription`(`storeTransactionId`);

-- CreateIndex
CREATE UNIQUE INDEX `Subscription_googlePurchaseToken_key` ON `Subscription`(`googlePurchaseToken`);

-- CreateIndex
CREATE INDEX `Subscription_billingProvider_idx` ON `Subscription`(`billingProvider`);

-- CreateIndex
CREATE INDEX `Subscription_storeOriginalTransactionId_idx` ON `Subscription`(`storeOriginalTransactionId`);

-- CreateIndex
CREATE INDEX `Subscription_storeProductId_idx` ON `Subscription`(`storeProductId`);

-- AddForeignKey
ALTER TABLE `UserAuthIdentity` ADD CONSTRAINT `UserAuthIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDeviceCredential` ADD CONSTRAINT `UserDeviceCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
