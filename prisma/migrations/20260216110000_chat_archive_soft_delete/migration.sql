-- Add chat archive per user and soft-delete support for messages
ALTER TABLE `chat_members`
  ADD COLUMN `archivedAt` DATETIME(3) NULL;

ALTER TABLE `chat_messages`
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `deletedById` VARCHAR(191) NULL;

CREATE INDEX `chat_messages_deletedById_idx` ON `chat_messages`(`deletedById`);

ALTER TABLE `chat_messages`
  ADD CONSTRAINT `chat_messages_deletedById_fkey`
  FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
