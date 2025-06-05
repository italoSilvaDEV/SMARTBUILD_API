-- CreateIndex
CREATE INDEX `Client_name_idx` ON `Client`(`name`);

-- CreateIndex
CREATE INDEX `Client_email_idx` ON `Client`(`email`);

-- CreateIndex
CREATE INDEX `Client_document_idx` ON `Client`(`document`);

-- CreateIndex
CREATE INDEX `Client_company_id_name_idx` ON `Client`(`company_id`, `name`);

-- CreateIndex
CREATE INDEX `Client_company_id_email_idx` ON `Client`(`company_id`, `email`);

-- RenameIndex
ALTER TABLE `Client` RENAME INDEX `Client_company_id_fkey` TO `Client_company_id_idx`;
