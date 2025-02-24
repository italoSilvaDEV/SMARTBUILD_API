-- CreateTable
CREATE TABLE `ContractNotes` (
    `id` VARCHAR(191) NOT NULL,
    `notes` TEXT NOT NULL,
    `company_id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContractNotes` ADD CONSTRAINT `ContractNotes_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
