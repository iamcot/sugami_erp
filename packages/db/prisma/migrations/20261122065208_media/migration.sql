-- CreateTable
CREATE TABLE `media_assets` (
    `id` CHAR(36) NOT NULL,
    `kind` ENUM('image', 'video', 'file') NOT NULL,
    `status` ENUM('pending', 'ready') NOT NULL DEFAULT 'pending',
    `storage_key` VARCHAR(512) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime` VARCHAR(127) NOT NULL,
    `size_bytes` BIGINT NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `checksum` CHAR(64) NULL,
    `alt` VARCHAR(255) NULL,
    `tags` JSON NULL,
    `source` VARCHAR(32) NOT NULL DEFAULT 'upload',
    `uploaded_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_assets_storage_key_key`(`storage_key`),
    INDEX `media_assets_status_created_at_idx`(`status`, `created_at`),
    INDEX `media_assets_checksum_idx`(`checksum`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `media_variants` (
    `id` CHAR(36) NOT NULL,
    `asset_id` CHAR(36) NOT NULL,
    `preset` VARCHAR(32) NOT NULL,
    `storage_key` VARCHAR(512) NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `size_bytes` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_variants_storage_key_key`(`storage_key`),
    UNIQUE INDEX `media_variants_asset_id_preset_key`(`asset_id`, `preset`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `product_media` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NULL,
    `asset_id` CHAR(36) NOT NULL,
    `role` ENUM('main', 'gallery', 'size_chart', 'video') NOT NULL DEFAULT 'gallery',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `channel_code` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_media_product_id_sort_idx`(`product_id`, `sort`),
    INDEX `product_media_asset_id_idx`(`asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_variants` ADD CONSTRAINT `media_variants_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_media` ADD CONSTRAINT `product_media_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_media` ADD CONSTRAINT `product_media_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_media` ADD CONSTRAINT `product_media_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
