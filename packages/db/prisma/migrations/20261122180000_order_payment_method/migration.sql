-- AlterTable
ALTER TABLE `orders` ADD COLUMN `payment_method` VARCHAR(16) NULL AFTER `paid_amount`;
