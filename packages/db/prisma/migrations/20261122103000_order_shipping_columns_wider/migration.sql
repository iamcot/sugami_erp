-- AlterTable: KiotViet tracking numbers / carrier names / statuses can exceed 64 characters.
ALTER TABLE `orders`
    MODIFY `shipping_status` VARCHAR(255) NULL,
    MODIFY `carrier` VARCHAR(255) NULL,
    MODIFY `tracking_no` VARCHAR(255) NULL;
