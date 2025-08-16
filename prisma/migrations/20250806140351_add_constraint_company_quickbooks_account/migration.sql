/*
  Warnings:

  - A unique constraint covering the columns `[company_id]` on the table `QuickBooksAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `QuickBooksAccount` ADD COLUMN `company_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `QuickBooksAccount_company_id_key` ON `QuickBooksAccount`(`company_id`);

-- AddForeignKey
ALTER TABLE `QuickBooksAccount` ADD CONSTRAINT `QuickBooksAccount_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
