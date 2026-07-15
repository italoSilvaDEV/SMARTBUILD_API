-- Optional client-generated event metadata. NULL keeps all existing mobile payloads valid.
ALTER TABLE `worker_location_pings`
  ADD COLUMN `clientEventId` VARCHAR(191) NULL,
  ADD COLUMN `protocolVersion` INTEGER NULL;

-- MySQL permits multiple NULL values in this unique index, so legacy clients without
-- clientEventId continue creating independent history rows.
CREATE UNIQUE INDEX `worker_location_pings_company_user_client_event_key`
  ON `worker_location_pings`(`companyId`, `userId`, `clientEventId`);
