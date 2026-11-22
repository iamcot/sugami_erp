-- CreateTable
CREATE TABLE `sync_cursors` (
    `key` VARCHAR(64) NOT NULL,
    `cursor` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
