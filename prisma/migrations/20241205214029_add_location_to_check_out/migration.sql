/*
  Warnings:

  - You are about to drop the column `address` on the `user_attendance` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `user_attendance` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `user_attendance` table. All the data in the column will be lost.
  - Added the required column `check_in_address` to the `user_attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `check_in_latitude` to the `user_attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `check_in_longitude` to the `user_attendance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `user_attendance` DROP COLUMN `address`,
    DROP COLUMN `latitude`,
    DROP COLUMN `longitude`,
    ADD COLUMN `check_in_address` VARCHAR(191) NOT NULL,
    ADD COLUMN `check_in_latitude` DOUBLE NOT NULL,
    ADD COLUMN `check_in_longitude` DOUBLE NOT NULL,
    ADD COLUMN `check_out_address` VARCHAR(191) NULL,
    ADD COLUMN `check_out_latitude` DOUBLE NULL,
    ADD COLUMN `check_out_longitude` DOUBLE NULL;
