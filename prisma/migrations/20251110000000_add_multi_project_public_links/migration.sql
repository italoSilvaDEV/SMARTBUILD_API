-- CreateTable: Tabela de relacionamento entre PublicFeedLink e Projects (N:N)
CREATE TABLE `PublicFeedLinkProject` (
    `id` VARCHAR(191) NOT NULL,
    `publicFeedLinkId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PublicFeedLinkProject_publicFeedLinkId_idx`(`publicFeedLinkId`),
    INDEX `PublicFeedLinkProject_projectId_idx`(`projectId`),
    UNIQUE INDEX `PublicFeedLinkProject_publicFeedLinkId_projectId_key`(`publicFeedLinkId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PublicFeedLinkProject` ADD CONSTRAINT `PublicFeedLinkProject_publicFeedLinkId_fkey` FOREIGN KEY (`publicFeedLinkId`) REFERENCES `PublicFeedLink`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicFeedLinkProject` ADD CONSTRAINT `PublicFeedLinkProject_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

