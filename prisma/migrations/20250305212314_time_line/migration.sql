-- CreateTable
CREATE TABLE `TimeLine` (
    `id` VARCHAR(191) NOT NULL,
    `check_in_time` DATETIME(3) NOT NULL,
    `check_in_address` VARCHAR(191) NOT NULL,
    `check_in_latitude` DOUBLE NOT NULL,
    `check_in_longitude` DOUBLE NOT NULL,
    `is_local_work` BOOLEAN NOT NULL,
    `date_creation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `date_update` DATETIME(3) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `service_project_id` VARCHAR(191) NOT NULL,
    `userServiceProjectId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TimeLine` ADD CONSTRAINT `TimeLine_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeLine` ADD CONSTRAINT `TimeLine_service_project_id_fkey` FOREIGN KEY (`service_project_id`) REFERENCES `ServiceProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeLine` ADD CONSTRAINT `TimeLine_userServiceProjectId_fkey` FOREIGN KEY (`userServiceProjectId`) REFERENCES `user_service_project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
