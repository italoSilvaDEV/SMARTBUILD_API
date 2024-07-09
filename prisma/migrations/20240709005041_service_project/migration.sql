-- CreateTable
CREATE TABLE `ServiceProject` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `hours` DECIMAL(65, 30) NOT NULL,
    `price` DECIMAL(65, 30) NOT NULL,
    `id_service` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImgServiceProject` (
    `id` VARCHAR(191) NOT NULL,
    `uri` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `serviceProjectId` VARCHAR(191) NULL,

    UNIQUE INDEX `ImgServiceProject_uri_key`(`uri`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ServiceProject` ADD CONSTRAINT `ServiceProject_id_service_fkey` FOREIGN KEY (`id_service`) REFERENCES `variable_service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImgServiceProject` ADD CONSTRAINT `ImgServiceProject_serviceProjectId_fkey` FOREIGN KEY (`serviceProjectId`) REFERENCES `ServiceProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
