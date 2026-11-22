-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `brands` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `brands_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `search_key` VARCHAR(255) NOT NULL,
    `category_id` CHAR(36) NULL,
    `brand_id` CHAR(36) NULL,
    `status` ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
    `description` TEXT NULL,
    `attributes` JSON NULL,
    `unit` VARCHAR(32) NOT NULL DEFAULT 'cái',
    `weight_grams` INTEGER NULL,
    `tags` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_code_key`(`code`),
    INDEX `products_search_key_idx`(`search_key`),
    INDEX `products_category_id_idx`(`category_id`),
    INDEX `products_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `product_options` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `product_options_product_id_name_key`(`product_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `product_option_values` (
    `id` CHAR(36) NOT NULL,
    `option_id` CHAR(36) NOT NULL,
    `value` VARCHAR(64) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `product_option_values_option_id_value_key`(`option_id`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `variants` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `barcode` VARCHAR(64) NULL,
    `option_values` JSON NOT NULL,
    `price` BIGINT NOT NULL DEFAULT 0,
    `compare_at_price` BIGINT NULL,
    `cost_avg` BIGINT NOT NULL DEFAULT 0,
    `weight_grams` INTEGER NULL,
    `min_stock` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `reorder_qty` DECIMAL(14, 3) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `variants_sku_key`(`sku`),
    UNIQUE INDEX `variants_barcode_key`(`barcode`),
    INDEX `variants_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `unit_conversions` (
    `id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NOT NULL,
    `unit` VARCHAR(32) NOT NULL,
    `factor` DECIMAL(14, 3) NOT NULL,
    `barcode` VARCHAR(64) NULL,

    UNIQUE INDEX `unit_conversions_barcode_key`(`barcode`),
    UNIQUE INDEX `unit_conversions_variant_id_unit_key`(`variant_id`, `unit`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `combo_items` (
    `combo_variant_id` CHAR(36) NOT NULL,
    `component_variant_id` CHAR(36) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,

    INDEX `combo_items_component_variant_id_idx`(`component_variant_id`),
    PRIMARY KEY (`combo_variant_id`, `component_variant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `price_lists` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `price_list_items` (
    `price_list_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NOT NULL,
    `price` BIGINT NOT NULL,
    `valid_from` DATETIME(3) NULL,
    `valid_to` DATETIME(3) NULL,

    PRIMARY KEY (`price_list_id`, `variant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `external_refs` (
    `id` CHAR(36) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` CHAR(36) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `external_id` VARCHAR(128) NOT NULL,
    `external_code` VARCHAR(128) NULL,
    `hash` VARCHAR(64) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `external_refs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    UNIQUE INDEX `external_refs_provider_entity_type_external_id_key`(`provider`, `entity_type`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `warehouses` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('store', 'warehouse', 'virtual') NOT NULL DEFAULT 'warehouse',
    `address` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `warehouses_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `stock_levels` (
    `warehouse_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NOT NULL,
    `on_hand` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `reserved` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `incoming` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `last_movement_id` BIGINT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `stock_levels_variant_id_idx`(`variant_id`),
    PRIMARY KEY (`warehouse_id`, `variant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `warehouse_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NOT NULL,
    `qty_delta` DECIMAL(14, 3) NOT NULL,
    `unit_cost` BIGINT NULL,
    `balance_after` DECIMAL(14, 3) NOT NULL,
    `type` ENUM('opening', 'purchase_in', 'sale_out', 'return_in', 'return_out', 'transfer_in', 'transfer_out', 'adjust', 'count', 'damage', 'kiotviet_import') NOT NULL,
    `document_id` CHAR(36) NULL,
    `ref_type` VARCHAR(32) NULL,
    `ref_id` VARCHAR(64) NULL,
    `note` VARCHAR(255) NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_movements_variant_id_warehouse_id_occurred_at_idx`(`variant_id`, `warehouse_id`, `occurred_at`),
    INDEX `stock_movements_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `stock_documents` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `type` ENUM('receipt', 'issue', 'transfer', 'adjustment', 'count') NOT NULL,
    `status` ENUM('draft', 'confirmed', 'cancelled') NOT NULL DEFAULT 'draft',
    `warehouse_id` CHAR(36) NOT NULL,
    `to_warehouse_id` CHAR(36) NULL,
    `reason` VARCHAR(255) NULL,
    `exported_to_kiotviet_at` DATETIME(3) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_documents_code_key`(`code`),
    INDEX `stock_documents_type_status_idx`(`type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `stock_document_lines` (
    `id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit_cost` BIGINT NULL,
    `note` VARCHAR(255) NULL,

    INDEX `stock_document_lines_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_options` ADD CONSTRAINT `product_options_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_option_values` ADD CONSTRAINT `product_option_values_option_id_fkey` FOREIGN KEY (`option_id`) REFERENCES `product_options`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variants` ADD CONSTRAINT `variants_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unit_conversions` ADD CONSTRAINT `unit_conversions_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_items` ADD CONSTRAINT `combo_items_combo_variant_id_fkey` FOREIGN KEY (`combo_variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_items` ADD CONSTRAINT `combo_items_component_variant_id_fkey` FOREIGN KEY (`component_variant_id`) REFERENCES `variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_list_items` ADD CONSTRAINT `price_list_items_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_list_items` ADD CONSTRAINT `price_list_items_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_levels` ADD CONSTRAINT `stock_levels_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_levels` ADD CONSTRAINT `stock_levels_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `stock_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_documents` ADD CONSTRAINT `stock_documents_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_documents` ADD CONSTRAINT `stock_documents_to_warehouse_id_fkey` FOREIGN KEY (`to_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_document_lines` ADD CONSTRAINT `stock_document_lines_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `stock_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_document_lines` ADD CONSTRAINT `stock_document_lines_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
