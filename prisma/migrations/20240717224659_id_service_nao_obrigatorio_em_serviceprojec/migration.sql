-- DropForeignKey
ALTER TABLE `ServiceProject` DROP FOREIGN KEY `ServiceProject_id_service_fkey`;

-- AlterTable
ALTER TABLE `ServiceProject` MODIFY `id_service` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_id_service_fkey` FOREIGN KEY (`id_service`) REFERENCES `variable_service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
