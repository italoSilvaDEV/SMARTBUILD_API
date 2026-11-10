-- Preserve linked legacy PDFs; pending legacy uploads have no inferred owner.
ALTER TABLE `pdf_project` ADD COLUMN `uploadedById` VARCHAR(191) NULL;
