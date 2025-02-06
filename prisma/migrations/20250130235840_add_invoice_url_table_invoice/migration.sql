/*
  Warnings:

  - Added the required column `invoiceUrl` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `invoiceUrl` VARCHAR(191) NOT NULL;
