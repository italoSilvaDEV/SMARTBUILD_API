-- CreateTable
CREATE TABLE `pdf_project` (
    `id` VARCHAR(191) NOT NULL,
    `original_file_name` VARCHAR(191) NULL,
    `uri` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NULL,
    `autorId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pdf_project` ADD CONSTRAINT `pdf_project_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
