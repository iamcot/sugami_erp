-- CreateTable
CREATE TABLE `channels` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `type` ENUM('shopee', 'tiktok', 'lazada', 'facebook', 'zalo', 'website', 'store') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shop_external_id` VARCHAR(64) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `settings` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `channels_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` CHAR(36) NOT NULL,
    `kiotviet_code` VARCHAR(64) NULL,
    `name` VARCHAR(191) NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(191) NULL,
    `address` JSON NULL,
    `tags` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_kiotviet_code_key`(`kiotviet_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `channel_id` CHAR(36) NOT NULL,
    `external_code` VARCHAR(64) NULL,
    `kiotviet_invoice_code` VARCHAR(64) NULL,
    `kiotviet_order_code` VARCHAR(64) NULL,
    `customer_id` CHAR(36) NULL,
    `warehouse_id` CHAR(36) NOT NULL,
    `status` ENUM('new', 'confirmed', 'packing', 'shipped', 'delivered', 'completed', 'cancelled', 'returned') NOT NULL DEFAULT 'new',
    `shipping_status` VARCHAR(64) NULL,
    `carrier` VARCHAR(64) NULL,
    `tracking_no` VARCHAR(64) NULL,
    `subtotal` BIGINT NOT NULL DEFAULT 0,
    `discount` BIGINT NOT NULL DEFAULT 0,
    `other_income` BIGINT NOT NULL DEFAULT 0,
    `total` BIGINT NOT NULL DEFAULT 0,
    `paid_amount` BIGINT NOT NULL DEFAULT 0,
    `cod_amount` BIGINT NOT NULL DEFAULT 0,
    `shipping_fee` BIGINT NOT NULL DEFAULT 0,
    `ordered_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `source` VARCHAR(32) NOT NULL,
    `stock_applied_at` DATETIME(3) NULL,
    `internal_note` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_code_key`(`code`),
    UNIQUE INDEX `orders_kiotviet_invoice_code_key`(`kiotviet_invoice_code`),
    INDEX `orders_channel_id_ordered_at_idx`(`channel_id`, `ordered_at`),
    INDEX `orders_ordered_at_idx`(`ordered_at`),
    INDEX `orders_status_idx`(`status`),
    INDEX `orders_external_code_idx`(`external_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `order_lines` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `unit_price` BIGINT NOT NULL,
    `discount` BIGINT NOT NULL DEFAULT 0,
    `price` BIGINT NOT NULL,
    `line_total` BIGINT NOT NULL,
    `cost_snapshot` BIGINT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `order_lines_order_id_idx`(`order_id`),
    INDEX `order_lines_variant_id_idx`(`variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_channel_id_fkey` FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
