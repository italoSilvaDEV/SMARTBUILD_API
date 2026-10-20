-- Várias landings no mesmo relatório: slug, nome e URL da landing e nomes legíveis de seções e botões.
-- Eventos já gravados pertencem à landing principal (pro-smartbuild).
ALTER TABLE `landing_analytics_events`
  ADD COLUMN `landingSlug` VARCHAR(64) NOT NULL DEFAULT 'pro-smartbuild' AFTER `device`,
  ADD COLUMN `landingName` VARCHAR(120) NULL AFTER `landingSlug`,
  ADD COLUMN `pageUrl` VARCHAR(255) NULL AFTER `landingName`,
  ADD COLUMN `sectionLabel` VARCHAR(120) NULL AFTER `section`,
  ADD COLUMN `targetLabel` VARCHAR(120) NULL AFTER `target`;

CREATE INDEX `landing_analytics_events_landingSlug_environment_occurredAt_idx`
  ON `landing_analytics_events`(`landingSlug`, `environment`, `occurredAt`);
