-- AlterTable
ALTER TABLE `customers`
    ADD COLUMN `search_key` VARCHAR(400) NULL,
    ADD COLUMN `gender` VARCHAR(16) NULL,
    ADD COLUMN `birthday` DATE NULL,
    ADD COLUMN `facebook` VARCHAR(255) NULL,
    ADD COLUMN `address_line` VARCHAR(500) NULL,
    ADD COLUMN `region` VARCHAR(191) NULL,
    ADD COLUMN `ward` VARCHAR(191) NULL,
    ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `kv_created_at` DATETIME(3) NULL,
    ADD COLUMN `last_purchase_at` DATETIME(3) NULL,
    ADD COLUMN `kv_total_sales` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `kv_debt` BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `customers_phone_idx` ON `customers`(`phone`);

-- CreateIndex
CREATE INDEX `customers_name_idx` ON `customers`(`name`);
