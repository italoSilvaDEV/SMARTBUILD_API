-- CreateTable
CREATE TABLE `UserPermission` (
    `id` VARCHAR(191) NOT NULL,
    `editAll` BOOLEAN NOT NULL DEFAULT false,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `office_id` VARCHAR(191) NOT NULL,
    `permission_id` VARCHAR(191) NOT NULL,

    INDEX `UserPermission_office_id_idx`(`office_id`),
    INDEX `UserPermission_permission_id_idx`(`permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserPermission` ADD CONSTRAINT `UserPermission_office_id_fkey` FOREIGN KEY (`office_id`) REFERENCES `Office`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserPermission` ADD CONSTRAINT `UserPermission_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `Permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
