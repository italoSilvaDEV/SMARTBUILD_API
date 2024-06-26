/*
  Warnings:

  - Made the column `rules` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `User` MODIFY `rules` JSON NOT NULL;
