-- CreateTable
CREATE TABLE `EstimateTimeline` (
    `id` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `estimateId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EstimateTimeline` ADD CONSTRAINT `EstimateTimeline_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
