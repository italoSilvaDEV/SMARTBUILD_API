/*
  Warnings:

  - You are about to drop the `_projectResponsibles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `_projectResponsibles` DROP FOREIGN KEY `_projectResponsibles_A_fkey`;

-- DropForeignKey
ALTER TABLE `_projectResponsibles` DROP FOREIGN KEY `_projectResponsibles_B_fkey`;

-- DropTable
DROP TABLE `_projectResponsibles`;
