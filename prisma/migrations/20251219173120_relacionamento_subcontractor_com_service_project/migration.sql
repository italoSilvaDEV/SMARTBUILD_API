-- CreateTable
CREATE TABLE `sub_contractor_service_project` (
    `id` VARCHAR(191) NOT NULL,
    `subcontractor_id` VARCHAR(191) NOT NULL,
    `service_project_id` VARCHAR(191) NULL,
    `sub_service_project_id` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    INDEX `sub_contractor_service_project_subcontractor_id_fkey`(`subcontractor_id`),
    INDEX `sub_contractor_service_project_service_project_id_fkey`(`service_project_id`),
    INDEX `sub_contractor_service_project_sub_service_project_id_fkey`(`sub_service_project_id`),
    UNIQUE INDEX `sub_contractor_service_project_unique`(`subcontractor_id`, `service_project_id`),
    UNIQUE INDEX `sub_contractor_service_project_unique_sub_service_unique`(`subcontractor_id`, `sub_service_project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sub_contractor_service_project` ADD CONSTRAINT `sub_contractor_service_project_subcontractor_id_fkey` FOREIGN KEY (`subcontractor_id`) REFERENCES `subcontractors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sub_contractor_service_project` ADD CONSTRAINT `sub_contractor_service_project_service_project_id_fkey` FOREIGN KEY (`service_project_id`) REFERENCES `ServiceProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sub_contractor_service_project` ADD CONSTRAINT `sub_contractor_service_project_sub_service_project_id_fkey` FOREIGN KEY (`sub_service_project_id`) REFERENCES `sub_services_project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;