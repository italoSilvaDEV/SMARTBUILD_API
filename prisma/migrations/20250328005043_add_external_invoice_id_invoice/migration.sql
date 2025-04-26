ALTER TABLE `Invoice` ADD COLUMN `externalInvoiceId` VARCHAR(255) NULL;
UPDATE `Invoice` SET `externalInvoiceId` = `stripeInvoiceId`;
ALTER TABLE `Invoice` ADD CONSTRAINT `unique_externalInvoiceId` UNIQUE (`externalInvoiceId`);