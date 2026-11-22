ALTER TABLE `orders`
  ADD COLUMN `ship_by_at` DATETIME(3) NULL,
  ADD COLUMN `ship_address` VARCHAR(500) NULL,
  ADD COLUMN `ship_province` VARCHAR(128) NULL,
  ADD COLUMN `platform_fee` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `fee_detail` JSON NULL;
