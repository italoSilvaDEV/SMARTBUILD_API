CREATE TABLE BillingPurchaseAttempt (
 companyId VARCHAR(191) NOT NULL, id VARCHAR(36) NOT NULL, provider VARCHAR(16) NOT NULL,
 planId VARCHAR(191) NOT NULL, requestKey VARCHAR(64) NOT NULL, state VARCHAR(24) NOT NULL,
 expiresAt DATETIME(3) NOT NULL, contractRef VARCHAR(191) NULL, params JSON NULL, checkoutId VARCHAR(191) NULL, checkoutUrl TEXT NULL,
 createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL,
 UNIQUE INDEX BillingPurchaseAttempt_id_key (id), PRIMARY KEY (companyId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE BillingConflict (
 id VARCHAR(64) NOT NULL, companyId VARCHAR(191) NOT NULL, provider VARCHAR(16) NOT NULL,
 contractRef VARCHAR(191) NOT NULL, blockingProvider VARCHAR(16) NOT NULL,
 state VARCHAR(24) NOT NULL DEFAULT 'open', reason VARCHAR(80) NOT NULL,
 firstSeenAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), lastSeenAt DATETIME(3) NOT NULL,
 resolvedAt DATETIME(3) NULL, INDEX BillingConflict_companyId_state_idx (companyId,state), PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
