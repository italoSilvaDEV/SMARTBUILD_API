-- CreateTable
CREATE TABLE `ChangeOrder` (
    `id` VARCHAR(191) NOT NULL,
    `approvedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `clientSignature` VARCHAR(191) NULL,
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

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChangeOrderServiceProject` (
    `id` VARCHAR(191) NOT NULL,
    `changeOrderId` VARCHAR(191) NOT NULL,
    `serviceProjectId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(65, 30) NOT NULL,
    `lineTotal` DECIMAL(65, 30) NOT NULL,
    `notes` TEXT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChangeOrderServiceProject_changeOrderId_serviceProjectId_key`(`changeOrderId`, `serviceProjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChangeOrder` ADD CONSTRAINT `ChangeOrder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChangeOrder` ADD CONSTRAINT `ChangeOrder_canceledById_fkey` FOREIGN KEY (`canceledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChangeOrderServiceProject` ADD CONSTRAINT `ChangeOrderServiceProject_changeOrderId_fkey` FOREIGN KEY (`changeOrderId`) REFERENCES `ChangeOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChangeOrderServiceProject` ADD CONSTRAINT `ChangeOrderServiceProject_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
