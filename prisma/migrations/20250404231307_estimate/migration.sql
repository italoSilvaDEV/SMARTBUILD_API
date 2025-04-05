-- CreateTable
CREATE TABLE `Estimate` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `approvedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `clientSignature` TEXT NULL,
    `totalAmount` DECIMAL(65, 30) NOT NULL,
    `description` TEXT NULL,
    `terms` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `canceledAt` DATETIME(3) NULL,
    `canceledById` VARCHAR(191) NULL,
    `cancellationReason` TEXT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Estimate_number_projectId_key`(`number`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstimateTimeline` (
    `id` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `estimateId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstimateServiceProject` (
    `id` VARCHAR(191) NOT NULL,
    `estimateId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(65, 30) NOT NULL,
    `lineTotal` DECIMAL(65, 30) NOT NULL,
    `notes` TEXT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EstimateServiceProject_estimateId_name_key`(`estimateId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EstimateEmailLog` (
    `id` VARCHAR(191) NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` TEXT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `estimateId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Estimate` ADD CONSTRAINT `Estimate_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Estimate` ADD CONSTRAINT `Estimate_canceledById_fkey` FOREIGN KEY (`canceledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstimateTimeline` ADD CONSTRAINT `EstimateTimeline_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstimateServiceProject` ADD CONSTRAINT `EstimateServiceProject_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstimateEmailLog` ADD CONSTRAINT `EstimateEmailLog_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
