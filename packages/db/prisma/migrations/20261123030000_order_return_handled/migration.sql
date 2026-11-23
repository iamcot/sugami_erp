-- AlterTable
ALTER TABLE `orders` ADD COLUMN `return_handled_at` DATETIME(3) NULL AFTER `stock_applied_at`;

-- Returned orders whose stock is already back (counter sales, KiotViet returns, or never deducted)
-- need nothing more from the shop. Marketplace returns that still hold stock stay "to handle".
UPDATE `orders` SET `return_handled_at` = `updated_at` WHERE `status` = 'returned' AND `stock_applied_at` IS NULL;
