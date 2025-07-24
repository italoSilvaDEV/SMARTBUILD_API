-- CreateTable
CREATE TABLE `sync_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `typesEntity` ENUM('customers', 'invoices', 'payments') NOT NULL,
    `typeSync` ENUM('bidirectional', 'QuickBooksToSmartBuild', 'SmartBuildToQuickBooks') NOT NULL DEFAULT 'bidirectional',
    `userId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sync_preferences` ADD CONSTRAINT `sync_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_preferences` ADD CONSTRAINT `sync_preferences_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
