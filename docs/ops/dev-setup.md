# Cài đặt môi trường phát triển / chạy trên iMac

## 1. Phần mềm cần có

| Phần mềm | Cách cài (macOS) |
|----------|------------------|
| Node.js 22 | `brew install node@22` hoặc [nodejs.org](https://nodejs.org) |
| pnpm 10 | `corepack enable && corepack prepare pnpm@10.28.0 --activate` |
| MySQL 8.4 (native) | `brew install mysql@8.4 && brew services start mysql@8.4`, hoặc bộ cài DMG trên dev.mysql.com |
| Docker (cho Redis) | Docker Desktop hoặc `brew install colima docker && colima start` |

## 2. Tạo database

```bash
mysql -uroot -p < scripts/mysql-init.sql
```

Script tạo database `sugami` và `sugami_shadow` (dùng cho `prisma migrate dev`) với collation `utf8mb4_0900_ai_ci`, cùng user `sugami`. **Đổi mật khẩu** trong script trước khi chạy trên máy thật.

Kiểm tra MySQL dùng đúng collation mặc định (khuyến nghị thêm vào `my.cnf`, với Homebrew là `/opt/homebrew/etc/my.cnf`):

```ini
[mysqld]
character-set-server = utf8mb4
collation-server = utf8mb4_0900_ai_ci
```

## 3. Cấu hình & chạy

```bash
cp .env.example .env        # sửa mật khẩu, khóa mã hóa
pnpm install
pnpm infra:up               # Redis trong Docker
pnpm db:migrate             # tạo bảng (P0-04)
pnpm db:seed                # dữ liệu mẫu
pnpm dev                    # web :3000, api :4000, worker
```

- Web: http://localhost:3000
- API: http://localhost:4000/health
- File (ảnh, video) lưu trong thư mục `STORAGE_DIR` (mặc định `./data/storage`), được sao lưu hàng đêm.

Máy không có MySQL native (ví dụ máy dev khác, CI) có thể chạy MySQL trong Docker: `pnpm infra:mysql`.

## 4. Khi các app chạy trong Docker (production, P0-13)

Container không gọi được `localhost` của iMac. Dùng `host.docker.internal` trong `DATABASE_URL`, ví dụ `mysql://sugami:<mật khẩu>@host.docker.internal:3306/sugami`. User `sugami@'%'` trong `mysql-init.sql` cho phép kết nối này; MySQL chỉ nên lắng nghe trong mạng nội bộ (không mở cổng 3306 ra internet).
