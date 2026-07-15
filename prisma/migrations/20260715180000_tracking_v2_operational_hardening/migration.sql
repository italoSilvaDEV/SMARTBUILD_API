-- Tracking 2.0 diagnostics are stored on the latest-location row so every ping
-- remains a single history insert plus a single monotonic live update.
ALTER TABLE `worker_live_locations`
  ADD COLUMN `protocolVersion` INTEGER NULL,
  ADD COLUMN `appVersion` VARCHAR(64) NULL,
  ADD COLUMN `platform` VARCHAR(32) NULL,
  ADD COLUMN `queueDepth` INTEGER NULL,
  ADD COLUMN `permissions` JSON NULL,
  ADD COLUMN `services` JSON NULL,
  ADD COLUMN `taskState` JSON NULL;

-- Composite indexes support open-attendance scans and one-row legacy fallback
-- lookups. The recordedAt index makes retention pruning seekable in small batches.
CREATE INDEX `timeline_user_assignment_recorded_idx`
  ON `TimeLine`(`user_id`, `userServiceProjectId`, `check_in_time`);

CREATE INDEX `user_attendance_company_open_user_idx`
  ON `user_attendance`(`company_id`, `check_out_time`, `user_id`);

CREATE INDEX `worker_location_pings_recorded_at_idx`
  ON `worker_location_pings`(`recordedAt`);

CREATE INDEX `worker_live_locations_recorded_at_idx`
  ON `worker_live_locations`(`recordedAt`);
