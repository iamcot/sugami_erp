-- AlterTable
ALTER TABLE `orders` ADD COLUMN `fulfillment` VARCHAR(16) NULL AFTER `paid_amount`;
