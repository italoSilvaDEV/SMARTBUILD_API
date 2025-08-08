-- CreateTable
CREATE TABLE `sync_status` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `entity` ENUM('customers', 'invoices', 'payments') NOT NULL,
    `syncType` ENUM('bidirectional', 'QuickBooksToSmartBuild', 'SmartBuildToQuickBooks') NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PAUSED') NOT NULL DEFAULT 'PENDING',
    `lastSyncAt` DATETIME(3) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `nextSyncAt` DATETIME(3) NULL,
    `totalRecords` INTEGER NOT NULL DEFAULT 0,
    `processedRecords` INTEGER NOT NULL DEFAULT 0,
    `successRecords` INTEGER NOT NULL DEFAULT 0,
    `errorRecords` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sync_status_companyId_userId_entity_syncType_key`(`companyId`, `userId`, `entity`, `syncType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sync_status` ADD CONSTRAINT `sync_status_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_status` ADD CONSTRAINT `sync_status_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
