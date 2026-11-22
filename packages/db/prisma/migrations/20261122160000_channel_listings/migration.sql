-- CreateTable
CREATE TABLE `channel_listings` (
    `id` CHAR(36) NOT NULL,
    `source` VARCHAR(32) NOT NULL,
    `shop_key` VARCHAR(191) NOT NULL DEFAULT '',
    `external_id` VARCHAR(128) NOT NULL,
    `marketplace_id` VARCHAR(32) NULL,
    `name` VARCHAR(512) NOT NULL,
    `sku` VARCHAR(128) NULL,
    `price` BIGINT NULL,
    `image_url` VARCHAR(1000) NULL,
    `synced_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `channel_listings_name_idx`(`name`(100)),
    UNIQUE INDEX `channel_listings_source_shop_key_external_id_key`(`source`, `shop_key`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `channel_listing_variants` (
    `id` CHAR(36) NOT NULL,
    `listing_id` CHAR(36) NOT NULL,
    `external_id` VARCHAR(128) NOT NULL,
    `name` VARCHAR(512) NULL,
    `sku` VARCHAR(128) NULL,
    `price` BIGINT NULL,
    `quantity` DECIMAL(14, 3) NULL,
    `images` JSON NULL,
    `variant_id` CHAR(36) NULL,
    `linked_by` VARCHAR(16) NULL,

    INDEX `channel_listing_variants_variant_id_idx`(`variant_id`),
    INDEX `channel_listing_variants_sku_idx`(`sku`),
    UNIQUE INDEX `channel_listing_variants_listing_id_external_id_key`(`listing_id`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `channel_listing_variants` ADD CONSTRAINT `channel_listing_variants_listing_id_fkey` FOREIGN KEY (`listing_id`) REFERENCES `channel_listings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `channel_listing_variants` ADD CONSTRAINT `channel_listing_variants_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
