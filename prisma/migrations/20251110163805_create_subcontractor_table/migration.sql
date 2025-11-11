-- DropForeignKey
ALTER TABLE `PublicFeedLink` DROP FOREIGN KEY `PublicFeedLink_createdBy_fkey`;

-- AlterTable
ALTER TABLE `worked_hours` ADD COLUMN `subcontractor_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `subcontractors` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `company_id` VARCHAR(191) NULL,

    UNIQUE INDEX `subcontractors_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PublicFeedLink` ADD CONSTRAINT `PublicFeedLink_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subcontractors` ADD CONSTRAINT `subcontractors_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_subcontractor_id_fkey` FOREIGN KEY (`subcontractor_id`) REFERENCES `subcontractors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
