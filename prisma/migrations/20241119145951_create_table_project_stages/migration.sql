-- CreateTable
CREATE TABLE `ProjectStages` (
    `id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `check` BOOLEAN NOT NULL DEFAULT false,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `id_user_update` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectStages` ADD CONSTRAINT `ProjectStages_id_user_update_fkey` FOREIGN KEY (`id_user_update`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
