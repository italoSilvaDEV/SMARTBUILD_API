CREATE TABLE IF NOT EXISTS `landing_analytics_events` (
 `id` VARCHAR(36) NOT NULL, `sessionId` VARCHAR(36) NOT NULL,
 `action` VARCHAR(32) NOT NULL, `environment` VARCHAR(16) NOT NULL,
 `device` VARCHAR(12) NOT NULL, `section` VARCHAR(100) NULL,
 `sectionIndex` INTEGER NULL, `target` VARCHAR(100) NULL,
 `value` INTEGER NULL, `durationMs` INTEGER NULL, `newVisitor` BOOLEAN NOT NULL DEFAULT false,
 `utmCampaign` VARCHAR(100) NULL, `utmSource` VARCHAR(100) NULL,
 `occurredAt` DATETIME(3) NOT NULL, `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), INDEX `landing_analytics_events_environment_occurredAt_idx` (`environment`,`occurredAt`),
 INDEX `landing_analytics_events_sessionId_occurredAt_idx` (`sessionId`,`occurredAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
