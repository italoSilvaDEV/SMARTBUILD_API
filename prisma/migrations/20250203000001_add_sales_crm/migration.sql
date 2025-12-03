-- CreateTable
CREATE TABLE `SalesPipeline` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_stage` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `color` VARCHAR(191) NULL,
    `pipelineId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_stage_pipelineId_position_key`(`pipelineId`, `position`),
    INDEX `sales_stage_pipelineId_idx`(`pipelineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_deal` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `estimatedValue` DECIMAL(10, 2) NULL,
    `companyId` VARCHAR(191) NULL,
    `pipelineId` VARCHAR(191) NOT NULL,
    `stageId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `assignedToId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `contactName` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `expectedCloseDate` DATETIME(3) NULL,
    `actualCloseDate` DATETIME(3) NULL,
    `isConverted` BOOLEAN NOT NULL DEFAULT false,
    `convertedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sales_deal_pipelineId_idx`(`pipelineId`),
    INDEX `sales_deal_stageId_idx`(`stageId`),
    INDEX `sales_deal_assignedToId_idx`(`assignedToId`),
    INDEX `sales_deal_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_activity` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sales_activity_dealId_idx`(`dealId`),
    INDEX `sales_activity_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sales_stage` ADD CONSTRAINT `sales_stage_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `SalesPipeline`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_deal` ADD CONSTRAINT `sales_deal_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_deal` ADD CONSTRAINT `sales_deal_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `SalesPipeline`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_deal` ADD CONSTRAINT `sales_deal_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `sales_stage`(`id`) ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_deal` ADD CONSTRAINT `sales_deal_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_activity` ADD CONSTRAINT `sales_activity_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `sales_deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_activity` ADD CONSTRAINT `sales_activity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

