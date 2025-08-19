-- AlterTable
ALTER TABLE `QuickBooksCustomerRaw` ADD COLUMN `clientId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `QuickBooksCustomerRaw` ADD CONSTRAINT `QuickBooksCustomerRaw_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
