-- AlterTable: Tornar projectId nullable para suportar links multi-projeto
ALTER TABLE `PublicFeedLink` MODIFY `projectId` VARCHAR(191) NULL;

