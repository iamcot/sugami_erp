-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` VARCHAR(500) NULL,
    `url` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_created_at_idx`(`created_at`),
    INDEX `notifications_kind_created_at_idx`(`kind`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
