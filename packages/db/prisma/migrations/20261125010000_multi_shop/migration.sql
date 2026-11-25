-- Multi-shop: a shops table, shop_id on every business table, per-shop unique codes.
-- All existing data and users belong to the first shop, Sugami (fixed id, also the column default).

-- CreateTable
CREATE TABLE `shops` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('retail', 'assembly') NOT NULL DEFAULT 'retail',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `integrations` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shops_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- The first shop. Its id is the default of every shop_id column, so existing rows (and writes that
-- happen outside a logged-in request, like the Pancake worker) belong to it.
INSERT INTO `shops` (`id`, `code`, `name`, `type`, `is_active`, `integrations`, `created_at`, `updated_at`)
VALUES ('00000000-0000-7000-8000-000000000001', 'sugami', 'Sugami', 'retail', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- DropIndex
DROP INDEX `brands_name_key` ON `brands`;

-- DropIndex
DROP INDEX `categories_slug_key` ON `categories`;

-- DropIndex
DROP INDEX `channels_code_key` ON `channels`;

-- DropIndex
DROP INDEX `customers_external_key_key` ON `customers`;

-- DropIndex
DROP INDEX `customers_kiotviet_code_key` ON `customers`;

-- DropIndex
DROP INDEX `orders_code_key` ON `orders`;

-- DropIndex
DROP INDEX `orders_kiotviet_invoice_code_key` ON `orders`;

-- DropIndex
DROP INDEX `products_code_key` ON `products`;

-- DropIndex
DROP INDEX `purchase_orders_code_key` ON `purchase_orders`;

-- DropIndex
DROP INDEX `stock_documents_code_key` ON `stock_documents`;

-- DropIndex
DROP INDEX `suppliers_name_key` ON `suppliers`;

-- DropIndex
DROP INDEX `variants_barcode_key` ON `variants`;

-- DropIndex
DROP INDEX `variants_sku_key` ON `variants`;

-- DropIndex
DROP INDEX `warehouses_code_key` ON `warehouses`;

-- AlterTable
ALTER TABLE `brands` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `categories` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `channel_listings` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `channels` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `chat_conversations` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `customers` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `media_assets` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `pos_drafts` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `price_lists` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `products` ADD COLUMN `kind` ENUM('goods', 'material', 'finished') NOT NULL DEFAULT 'goods',
    ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `purchase_orders` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `receipt_templates` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `stock_documents` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `suppliers` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `is_platform_admin` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `variants` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- AlterTable
ALTER TABLE `warehouses` ADD COLUMN `shop_id` CHAR(36) NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';

-- CreateTable
CREATE TABLE `order_line_components` (
    `id` CHAR(36) NOT NULL,
    `order_line_id` CHAR(36) NOT NULL,
    `variant_id` CHAR(36) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `unit_cost` BIGINT NOT NULL DEFAULT 0,

    INDEX `order_line_components_order_line_id_idx`(`order_line_id`),
    INDEX `order_line_components_variant_id_idx`(`variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateIndex
CREATE UNIQUE INDEX `brands_shop_id_name_key` ON `brands`(`shop_id`, `name`);

-- CreateIndex
CREATE UNIQUE INDEX `categories_shop_id_slug_key` ON `categories`(`shop_id`, `slug`);

-- CreateIndex
CREATE INDEX `channel_listings_shop_id_idx` ON `channel_listings`(`shop_id`);

-- CreateIndex
CREATE UNIQUE INDEX `channels_shop_id_code_key` ON `channels`(`shop_id`, `code`);

-- CreateIndex
CREATE INDEX `chat_conversations_shop_id_idx` ON `chat_conversations`(`shop_id`);

-- CreateIndex
CREATE UNIQUE INDEX `customers_shop_id_kiotviet_code_key` ON `customers`(`shop_id`, `kiotviet_code`);

-- CreateIndex
CREATE UNIQUE INDEX `customers_shop_id_external_key_key` ON `customers`(`shop_id`, `external_key`);

-- CreateIndex
CREATE INDEX `media_assets_shop_id_idx` ON `media_assets`(`shop_id`);

-- CreateIndex
CREATE INDEX `notifications_shop_id_idx` ON `notifications`(`shop_id`);

-- CreateIndex
CREATE UNIQUE INDEX `orders_shop_id_code_key` ON `orders`(`shop_id`, `code`);

-- CreateIndex
CREATE UNIQUE INDEX `orders_shop_id_kiotviet_invoice_code_key` ON `orders`(`shop_id`, `kiotviet_invoice_code`);

-- CreateIndex
CREATE INDEX `pos_drafts_shop_id_idx` ON `pos_drafts`(`shop_id`);

-- CreateIndex
CREATE INDEX `price_lists_shop_id_idx` ON `price_lists`(`shop_id`);

-- CreateIndex
CREATE UNIQUE INDEX `products_shop_id_code_key` ON `products`(`shop_id`, `code`);

-- CreateIndex
CREATE UNIQUE INDEX `purchase_orders_shop_id_code_key` ON `purchase_orders`(`shop_id`, `code`);

-- CreateIndex
CREATE INDEX `receipt_templates_shop_id_idx` ON `receipt_templates`(`shop_id`);

-- CreateIndex
CREATE UNIQUE INDEX `stock_documents_shop_id_code_key` ON `stock_documents`(`shop_id`, `code`);

-- CreateIndex
CREATE UNIQUE INDEX `suppliers_shop_id_name_key` ON `suppliers`(`shop_id`, `name`);

-- CreateIndex
CREATE INDEX `users_shop_id_idx` ON `users`(`shop_id`);

-- CreateIndex
CREATE UNIQUE INDEX `variants_shop_id_sku_key` ON `variants`(`shop_id`, `sku`);

-- CreateIndex
CREATE UNIQUE INDEX `variants_shop_id_barcode_key` ON `variants`(`shop_id`, `barcode`);

-- CreateIndex
CREATE UNIQUE INDEX `warehouses_shop_id_code_key` ON `warehouses`(`shop_id`, `code`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_line_components` ADD CONSTRAINT `order_line_components_order_line_id_fkey` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_line_components` ADD CONSTRAINT `order_line_components_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing owners run the platform: they can create new shops and their accounts.
UPDATE `users` u SET u.`is_platform_admin` = true
WHERE EXISTS (SELECT 1 FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`role_id` WHERE ur.`user_id` = u.`id` AND r.`code` = 'owner');
