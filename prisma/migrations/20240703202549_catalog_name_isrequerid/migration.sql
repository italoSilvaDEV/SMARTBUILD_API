/*
  Warnings:

  - A unique constraint covering the columns `[catalog_name]` on the table `catalog` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `catalog_catalog_name_key` ON `catalog`(`catalog_name`);
