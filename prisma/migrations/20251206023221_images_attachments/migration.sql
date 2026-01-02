-- CreateTable
CREATE TABLE `images_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `original_filename` TEXT NULL,
    `url` TEXT NOT NULL,
    `title` TEXT NULL,
    `projectId` VARCHAR(191) NULL,
    `estimateId` VARCHAR(191) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `images_attachments` ADD CONSTRAINT `images_attachments_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `images_attachments` ADD CONSTRAINT `images_attachments_estimateId_fkey` FOREIGN KEY (`estimateId`) REFERENCES `Estimate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `images_attachments` ADD CONSTRAINT `images_attachments_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
