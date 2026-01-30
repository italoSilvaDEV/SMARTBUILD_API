-- AlterTable
ALTER TABLE `Office` ADD COLUMN `company_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Office_company_id_idx` ON `Office`(`company_id`);

-- AddForeignKey
ALTER TABLE `Office` ADD CONSTRAINT `Office_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
