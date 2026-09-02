ALTER TABLE `bid_request_recipient`
  ADD COLUMN `submissionSource` VARCHAR(191) NOT NULL DEFAULT 'portal',
  ADD COLUMN `externalDocumentKey` TEXT NULL,
  ADD COLUMN `externalDocumentName` VARCHAR(191) NULL,
  ADD COLUMN `externalDocumentContentType` VARCHAR(191) NULL,
  ADD COLUMN `externalDocumentSize` INTEGER NULL,
  ADD COLUMN `extractionConfidence` DOUBLE NULL;
