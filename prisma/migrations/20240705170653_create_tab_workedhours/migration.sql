-- CreateTable
CREATE TABLE `worked_hours` (
    `id` VARCHAR(191) NOT NULL,
    `name_user` VARCHAR(191) NOT NULL,
    `amount_of_hours` DECIMAL(65, 30) NOT NULL,
    `hourly_price` DECIMAL(65, 30) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
