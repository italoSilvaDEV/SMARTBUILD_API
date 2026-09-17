ALTER TABLE `bid_request_recipient`
  ADD COLUMN `categoryId` VARCHAR(191) NULL,
  ADD COLUMN `categoryName` VARCHAR(191) NULL;

CREATE INDEX `bid_request_recipient_categoryId_idx`
  ON `bid_request_recipient`(`categoryId`);

ALTER TABLE `bid_request_recipient`
  ADD CONSTRAINT `bid_request_recipient_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `service`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
