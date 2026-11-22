-- CreateTable
CREATE TABLE `webhook_events` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `event_type` VARCHAR(64) NOT NULL,
    `delivery_id` VARCHAR(128) NOT NULL,
    `body` JSON NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,
    `error` TEXT NULL,

    INDEX `webhook_events_processed_at_received_at_idx`(`processed_at`, `received_at`),
    UNIQUE INDEX `webhook_events_provider_delivery_id_key`(`provider`, `delivery_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
