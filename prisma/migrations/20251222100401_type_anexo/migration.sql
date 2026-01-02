-- AlterTable
ALTER TABLE `images_attachments` ADD COLUMN `type_images_attachments` ENUM('image', 'document') NOT NULL DEFAULT 'image';