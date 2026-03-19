/*
  Warnings:

  - You are about to drop the column `stripePriceId` on the `extra_employee_config` table. All the data in the column will be lost.
  - You are about to drop the column `stripeProductId` on the `extra_employee_config` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `extra_employee_config` DROP COLUMN `stripePriceId`,
    DROP COLUMN `stripeProductId`;
