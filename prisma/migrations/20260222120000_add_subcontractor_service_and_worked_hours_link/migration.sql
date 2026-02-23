-- CreateTable
CREATE TABLE `subcontractor_services` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `company_id` VARCHAR(191) NULL,

    INDEX `subcontractor_services_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `worked_hours` ADD COLUMN `subcontractor_service_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `subcontractor_services` ADD CONSTRAINT `subcontractor_services_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worked_hours` ADD CONSTRAINT `worked_hours_subcontractor_service_id_fkey` FOREIGN KEY (`subcontractor_service_id`) REFERENCES `subcontractor_services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
