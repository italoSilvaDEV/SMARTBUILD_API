-- CreateTable
CREATE TABLE `catalog` (
    `id` VARCHAR(191) NOT NULL,
    `catalog_img` VARCHAR(191) NULL,
    `catalog_name` VARCHAR(191) NOT NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project` (
    `id` VARCHAR(191) NOT NULL,
    `seller_user_id` VARCHAR(191) NULL,
    `price` DECIMAL(65, 30) NOT NULL,
    `status_project` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `document` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `city_and_state` VARCHAR(191) NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Client_email_key`(`email`),
    UNIQUE INDEX `Client_document_key`(`document`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_cost_project` (
    `id` VARCHAR(191) NOT NULL,
    `original_file_name` VARCHAR(191) NULL,
    `uri` VARCHAR(191) NULL,
    `project_cost_invoice_exists` BOOLEAN NOT NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `project_id` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cost_project` (
    `id` VARCHAR(191) NOT NULL,
    `material_name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(65, 30) NOT NULL,
    `amout` INTEGER NOT NULL,
    `userId` VARCHAR(191) NULL,
    `service_id` VARCHAR(191) NULL,
    `invoice_cost_project_id` VARCHAR(191) NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_seller_user_id_fkey` FOREIGN KEY (`seller_user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_cost_project` ADD CONSTRAINT `invoice_cost_project_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_project` ADD CONSTRAINT `cost_project_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_project` ADD CONSTRAINT `cost_project_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `variable_service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_project` ADD CONSTRAINT `cost_project_invoice_cost_project_id_fkey` FOREIGN KEY (`invoice_cost_project_id`) REFERENCES `invoice_cost_project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
