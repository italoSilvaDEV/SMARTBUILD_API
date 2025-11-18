-- CreateTable
CREATE TABLE `change_order` (
    `id` VARCHAR(191) NOT NULL,
    `scope_of_work` TEXT NULL,
    `status` ENUM('canceled', 'pending', 'approved') NOT NULL DEFAULT 'pending',
    `total_amount` DECIMAL(65, 30) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `estimateId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `change_order_service` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(65, 30) NOT NULL,
    `lineTotal` DECIMAL(65, 30) NOT NULL,
    `price` DECIMAL(65, 30) NOT NULL,
    `changeOrderId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `change_order` ADD CONSTRAINT `change_order_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `change_order_service` ADD CONSTRAINT `change_order_service_changeOrderId_fkey` FOREIGN KEY (`changeOrderId`) REFERENCES `change_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
