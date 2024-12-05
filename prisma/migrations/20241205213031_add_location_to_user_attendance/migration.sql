/*
  Warnings:

  - Added the required column `address` to the `user_attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `latitude` to the `user_attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitude` to the `user_attendance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `user_attendance` ADD COLUMN `address` VARCHAR(191) NOT NULL,
    ADD COLUMN `latitude` DOUBLE NOT NULL,
    ADD COLUMN `longitude` DOUBLE NOT NULL;
