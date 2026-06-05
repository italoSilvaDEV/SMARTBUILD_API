-- AlterTable
ALTER TABLE `EstimateServiceProject` ADD COLUMN `idQuickbooks` VARCHAR(191) NULL,
    ADD COLUMN `quickbooksRaw` JSON NULL;

-- CreateIndex
CREATE INDEX `EstimateServiceProject_estimateId_idQuickbooks_idx` ON `EstimateServiceProject`(`estimateId`, `idQuickbooks`);
