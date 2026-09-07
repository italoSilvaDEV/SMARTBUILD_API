ALTER TABLE `bid_request_recipient`
  ADD COLUMN `deliveryStatus` VARCHAR(191) NOT NULL DEFAULT 'not_sent',
  ADD COLUMN `invitedAt` DATETIME(3) NULL,
  ADD COLUMN `lastSentAt` DATETIME(3) NULL,
  ADD COLUMN `sendCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `enteredById` VARCHAR(191) NULL,
  ADD COLUMN `enteredAt` DATETIME(3) NULL;

UPDATE `bid_request_recipient` AS recipient
INNER JOIN `bid_request` AS request ON request.`id` = recipient.`bidRequestId`
SET
  recipient.`deliveryStatus` = 'sent',
  recipient.`invitedAt` = request.`sentAt`,
  recipient.`lastSentAt` = request.`sentAt`,
  recipient.`sendCount` = 1
WHERE request.`sentAt` IS NOT NULL
  AND recipient.`submissionSource` = 'portal';

UPDATE `bid_request`
SET `status` = 'pending', `finalizedAt` = NULL
WHERE `status` = 'finalized'
  AND `approvedRecipientId` IS NULL
  AND `responseDeadline` > CURRENT_TIMESTAMP(3);
