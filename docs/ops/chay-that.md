# Chạy thật trên iMac

Không dùng `pnpm dev` để chạy hằng ngày: dev chậm, tốn máy và không tự bật lại khi iMac khởi động. Chạy thật dùng bản build + **pm2** (giữ 3 tiến trình `sugami-api`, `sugami-web`, `sugami-worker`, tự bật lại khi lỗi hoặc khi mở máy).

Điều kiện: MySQL native đang chạy, file `.env` đã điền đủ (xem `.env.example`), Redis đã chạy (xem dưới).

## Cài một lần

```bash
brew install redis
brew services start redis  # Redis native, tự chạy lúc khởi động máy, không cần Docker
redis-cli ping             # phải trả về PONG
npm install -g pm2
bash scripts/update.sh     # cài, build, cập nhật DB, bật 3 tiến trình
pm2 startup                # in ra 1 lệnh sudo, copy chạy đúng lệnh đó
pm2 save
```

`.env` giữ `REDIS_URL=redis://localhost:6379`.

### Mở máy là tự chạy

MySQL và Redis chạy native nên lên ngay lúc khởi động. pm2 chạy theo tài khoản người dùng nên chỉ bật **sau khi đăng nhập**:

1. System Settings > Users & Groups > bật **Automatically log in as** cho tài khoản chạy Sugami (cần tắt FileVault).
2. System Settings > Energy: không cho ngủ, và bật "Start up automatically after a power failure".

Nếu API/worker lên trước MySQL/Redis thì lỗi vài lần rồi pm2 tự thử lại, giãn dần, khoảng một hai phút là ổn.

## Hằng ngày

| Việc | Lệnh |
| --- | --- |
| Xem trạng thái | `pm2 status` |
| Xem log (tất cả) | `pm2 logs` |
| Log từng cái | `pm2 logs sugami-api` / `sugami-web` / `sugami-worker` |
| Khởi động lại 1 cái | `pm2 restart sugami-api` |
| Dừng hết | `pm2 stop all` |
| Bật lại hết | `pm2 start ecosystem.config.cjs` |

## Sao lưu DB hằng đêm

pm2 chạy `scripts/backup.sh` lúc 3h sáng (tiến trình `sugami-backup`, bình thường ở trạng thái "stopped" giữa các lần chạy). File `.sql.gz` nằm ở `~/sugami-backups`, giữ 14 ngày (đổi bằng `BACKUP_DIR`, `BACKUP_KEEP_DAYS` trong `.env`). Cần `mysqldump` (có sẵn khi cài MySQL; nếu thiếu thì `brew install mysql-client` rồi thêm vào PATH).

- Chạy thử ngay: `bash scripts/backup.sh`, xem log `pm2 logs sugami-backup`.
- Khôi phục: `gunzip -c file.sql.gz | mysql -u sugami -p sugami`.
- Khi `.env` có `S3_BUCKET` (và `STORAGE_DRIVER=s3`), mỗi bản được đẩy thêm lên `<S3_PREFIX>backups/` qua lớp lưu trữ của Sugami (không cần `aws` cli). Cần đã chạy `bash scripts/update.sh` (nó build gói storage). Bản trên S3 không tự xóa: đặt Lifecycle rule của bucket (ví dụ xóa sau 30 ngày) ở thư mục `backups/`.

## Cập nhật khi có code mới

```bash
cd ~/sugami_erp
bash scripts/update.sh
```

Script tự làm: `git pull`, cài gói, build, chạy migration DB, nạp lại 3 tiến trình. Mất vài phút, web chỉ gián đoạn vài giây.

## Hay gặp

- Web báo lỗi gọi API: `pm2 logs sugami-api`, thường do `.env` thiếu hoặc MySQL/Redis chưa chạy (`brew services list`).
- Đổi `.env`: `pm2 restart all --update-env`.
- Địa chỉ ngoài (`erp.sugami.vn`, `hooks.sugami.vn`) do Cloudflare Tunnel trỏ về cổng 3000 (web) và 4000 (API, webhook). Trang chủ `sugami.vn` chạy trên Cloudflare Pages, không qua iMac (xem [trang-chu.md](trang-chu.md)).
- Muốn thử code mới mà không ảnh hưởng bản đang chạy: dùng `pnpm dev` trên cổng khác, hoặc `pm2 stop all` trước rồi mới `pnpm dev`.
