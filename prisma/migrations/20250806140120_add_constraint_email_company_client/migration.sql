/*
  Warnings:

  - A unique constraint covering the columns `[email,company_id]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Client_email_company_id_key` ON `Client`(`email`, `company_id`);
