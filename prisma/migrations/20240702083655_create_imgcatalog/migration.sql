-- CreateTable
CREATE TABLE `imgcatalog` (
    `id` VARCHAR(191) NOT NULL,
    `uri` VARCHAR(191) NOT NULL,
    `data_criacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `authorId` VARCHAR(191) NULL,
    `catalog_id` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `imgcatalog_uri_key`(`uri`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `imgcatalog` ADD CONSTRAINT `imgcatalog_catalog_id_fkey` FOREIGN KEY (`catalog_id`) REFERENCES `catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
