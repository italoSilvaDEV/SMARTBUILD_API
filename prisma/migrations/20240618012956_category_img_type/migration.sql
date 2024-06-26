/*
  Warnings:

  - Added the required column `type_category` to the `service` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `service` ADD COLUMN `category_img` VARCHAR(191) NULL,
    ADD COLUMN `type_category` VARCHAR(191) NOT NULL;
