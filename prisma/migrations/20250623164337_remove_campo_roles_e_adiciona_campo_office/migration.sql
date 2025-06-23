/*
  Warnings:

  - You are about to drop the column `role` on the `user_company` table. All the data in the column will be lost.
  - Added the required column `office_id` to the `user_company` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `user_company` DROP COLUMN `role`,
    ADD COLUMN `office_id` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `user_company` ADD CONSTRAINT `user_company_office_id_fkey` FOREIGN KEY (`office_id`) REFERENCES `Office`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
