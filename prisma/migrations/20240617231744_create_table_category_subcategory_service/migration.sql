-- CreateTable
CREATE TABLE `service` (
    `id` VARCHAR(191) NOT NULL,
    `status_category` BOOLEAN NULL,
    `category_name` VARCHAR(191) NOT NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subcategory` (
    `id` VARCHAR(191) NOT NULL,
    `status_subcategory` BOOLEAN NULL,
    `subcategory_name` VARCHAR(191) NOT NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variable_service` (
    `id` VARCHAR(191) NOT NULL,
    `service_name` VARCHAR(191) NOT NULL,
    `type_variable` VARCHAR(191) NOT NULL,
    `price_type` VARCHAR(191) NOT NULL,
    `price_fixe` DECIMAL(65, 30) NULL,
    `price_minimum` DECIMAL(65, 30) NULL,
    `price_maximum` DECIMAL(65, 30) NULL,
    `sub_category_id` VARCHAR(191) NOT NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subcategory` ADD CONSTRAINT `subcategory_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variable_service` ADD CONSTRAINT `variable_service_sub_category_id_fkey` FOREIGN KEY (`sub_category_id`) REFERENCES `subcategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
