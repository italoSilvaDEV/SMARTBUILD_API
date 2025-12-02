-- CreateTable
CREATE TABLE `tutorial_progress` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `tutorial_code` VARCHAR(100) NOT NULL,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_tutorial_progress_user`(`user_id`),
    INDEX `idx_tutorial_progress_tutorial`(`tutorial_code`),
    INDEX `idx_tutorial_progress_completed`(`completed`),
    UNIQUE INDEX `unique_user_tutorial`(`user_id`, `tutorial_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tutorial_progress` ADD CONSTRAINT `tutorial_progress_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
