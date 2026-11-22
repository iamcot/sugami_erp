-- AlterTable
ALTER TABLE `customers` ADD COLUMN `external_key` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `customers_external_key_key` ON `customers`(`external_key`);
