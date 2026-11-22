-- One-time setup for a native MySQL 8.4 install (run as root):
--   mysql -uroot -p < scripts/mysql-init.sql
-- Change the password, then put the same value in .env (DATABASE_URL).

CREATE DATABASE IF NOT EXISTS sugami CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS sugami_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'sugami'@'localhost' IDENTIFIED BY 'sugami-dev';
-- Containers reach the host MySQL from the Docker network, so allow non-localhost too.
CREATE USER IF NOT EXISTS 'sugami'@'%' IDENTIFIED BY 'sugami-dev';

GRANT ALL PRIVILEGES ON sugami.* TO 'sugami'@'localhost', 'sugami'@'%';
GRANT ALL PRIVILEGES ON sugami_shadow.* TO 'sugami'@'localhost', 'sugami'@'%';
FLUSH PRIVILEGES;
