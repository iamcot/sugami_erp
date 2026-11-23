-- CreateTable
CREATE TABLE `chat_conversations` (
    `id` VARCHAR(128) NOT NULL,
    `page_id` VARCHAR(64) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `customer_name` VARCHAR(191) NOT NULL DEFAULT '',
    `snippet` VARCHAR(500) NOT NULL DEFAULT '',
    `last_message_at` DATETIME(3) NOT NULL,
    `last_from_buyer` BOOLEAN NOT NULL DEFAULT false,
    `notified_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reviewed_by` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `chat_conversations_last_from_buyer_last_message_at_idx`(`last_from_buyer`, `last_message_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
