-- CreateTable
CREATE TABLE `app_settings` (
    `key` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `shipments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `external_id` VARCHAR(64) NULL,
    `track_id` VARCHAR(64) NULL,
    `partner_code` VARCHAR(32) NOT NULL,
    `partner_name` VARCHAR(64) NULL,
    `service_id` VARCHAR(64) NOT NULL,
    `service_name` VARCHAR(128) NULL,
    `partner_track_no` VARCHAR(64) NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'queued',
    `phase` VARCHAR(20) NOT NULL DEFAULT 'waiting',
    `fee_delivery` BIGINT NOT NULL DEFAULT 0,
    `fee_insurance` BIGINT NOT NULL DEFAULT 0,
    `fee_cod` BIGINT NOT NULL DEFAULT 0,
    `fee_total` BIGINT NOT NULL DEFAULT 0,
    `quoted_price` BIGINT NOT NULL DEFAULT 0,
    `cod_amount` BIGINT NOT NULL DEFAULT 0,
    `payee` VARCHAR(16) NOT NULL DEFAULT 'receiver',
    `weight_grams` INTEGER NOT NULL,
    `length_cm` INTEGER NOT NULL,
    `width_cm` INTEGER NOT NULL,
    `height_cm` INTEGER NOT NULL,
    `track_link` VARCHAR(500) NULL,
    `partner_track_link` VARCHAR(500) NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `livemode` BOOLEAN NOT NULL DEFAULT false,
    `picked_up_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `canceled_at` DATETIME(3) NULL,
    `last_event_at` DATETIME(3) NULL,
    `last_polled_at` DATETIME(3) NULL,
    `error` VARCHAR(500) NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shipments_idempotency_key_key`(`idempotency_key`),
    UNIQUE INDEX `shipments_provider_external_id_key`(`provider`, `external_id`),
    INDEX `shipments_order_id_idx`(`order_id`),
    INDEX `shipments_phase_last_polled_at_idx`(`phase`, `last_polled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `shipment_events` (
    `id` CHAR(36) NOT NULL,
    `shipment_id` CHAR(36) NOT NULL,
    `external_event_id` VARCHAR(128) NOT NULL,
    `status` VARCHAR(40) NOT NULL,
    `status_name` VARCHAR(191) NULL,
    `note` VARCHAR(500) NULL,
    `location` VARCHAR(255) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `shipment_events_shipment_id_external_event_id_key`(`shipment_id`, `external_event_id`),
    INDEX `shipment_events_shipment_id_occurred_at_idx`(`shipment_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_events` ADD CONSTRAINT `shipment_events_shipment_id_fkey` FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
