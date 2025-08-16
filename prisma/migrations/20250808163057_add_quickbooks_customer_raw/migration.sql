-- CreateTable
CREATE TABLE `QuickBooksCustomerRaw` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `quickbooksId` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuickBooksCustomerRaw_companyId_idx`(`companyId`),
    INDEX `QuickBooksCustomerRaw_quickbooksId_idx`(`quickbooksId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
