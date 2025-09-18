-- AlterTable
ALTER TABLE `Estimate` ADD COLUMN `amountPaid` DECIMAL(65, 30) NULL DEFAULT 0,
    ADD COLUMN `balanceDue` DECIMAL(65, 30) NULL;

-- AlterTable
ALTER TABLE `project` ADD COLUMN `amountPaid` DECIMAL(65, 30) NULL DEFAULT 0,
    ADD COLUMN `balanceDue` DECIMAL(65, 30) NULL;

-- CreateTable
CREATE TABLE `invoice_payment_time_line` (
    `id` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `estimateId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invoice_payment_time_line` ADD CONSTRAINT `invoice_payment_time_line_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_payment_time_line` ADD CONSTRAINT `invoice_payment_time_line_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
