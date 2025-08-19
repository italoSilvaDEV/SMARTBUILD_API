-- AlterTable
ALTER TABLE `Estimateserviceproject` ADD COLUMN `deadline` VARCHAR(191) NULL,
    ADD COLUMN `hours` DECIMAL(65, 30) NULL,
    ADD COLUMN `id_service` VARCHAR(191) NULL,
    ADD COLUMN `price` DECIMAL(65, 30) NULL,
    ADD COLUMN `start_date` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `EstimateServiceProject` ADD CONSTRAINT `EstimateServiceProject_id_service_fkey` FOREIGN KEY (`id_service`) REFERENCES `variable_service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
