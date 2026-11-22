# Chạy thật trên iMac

Không dùng `pnpm dev` để chạy hằng ngày: dev chậm, tốn máy và không tự bật lại khi iMac khởi động. Chạy thật dùng bản build + **pm2** (giữ 3 tiến trình `sugami-api`, `sugami-web`, `sugami-worker`, tự bật lại khi lỗi hoặc khi mở máy).

Điều kiện: MySQL native đang chạy, file `.env` đã điền đủ (xem `.env.example`), Docker Desktop đang mở (cho Redis).

## Cài một lần

```bash
npm install -g pm2
pnpm infra:up              # Redis (Docker, tự chạy lại nhờ restart: unless-stopped)
bash scripts/update.sh     # cài, build, cập nhật DB, bật 3 tiến trình
pm2 startup                # in ra 1 lệnh sudo, copy chạy đúng lệnh đó
pm2 save
```

### Mở máy là tự chạy

Docker Desktop và pm2 (chạy theo tài khoản người dùng) chỉ bật **sau khi đăng nhập**, nên:

1. System Settings > Users & Groups > bật **Automatically log in as** cho tài khoản chạy Sugami (cần tắt FileVault).
2. Docker Desktop > Settings > General > bật "Start Docker Desktop when you sign in".
3. System Settings > Energy: không cho ngủ, và bật "Start up automatically after a power failure".

Lúc mới mở máy, Redis (Docker) lên chậm hơn API/worker nên chúng có thể lỗi vài lần đầu: pm2 tự thử lại, giãn dần, khoảng một hai phút là ổn. MySQL native tự chạy từ lúc khởi động.

Nếu không muốn bật tự đăng nhập: chạy Redis native (`brew install redis && brew services start redis`, bỏ Docker) thì Redis và MySQL lên lúc khởi động. Nhưng pm2 vẫn cần đăng nhập, trừ khi chuyển sang dịch vụ hệ thống (phức tạp hơn, chưa cần).

## Hằng ngày

| Việc | Lệnh |
| --- | --- |
| Xem trạng thái | `pm2 status` |
| Xem log (tất cả) | `pm2 logs` |
| Log từng cái | `pm2 logs sugami-api` / `sugami-web` / `sugami-worker` |
| Khởi động lại 1 cái | `pm2 restart sugami-api` |
| Dừng hết | `pm2 stop all` |
| Bật lại hết | `pm2 start ecosystem.config.cjs` |

## Cập nhật khi có code mới

```bash
cd ~/sugami_erp
bash scripts/update.sh
```

Script tự làm: `git pull`, cài gói, build, chạy migration DB, nạp lại 3 tiến trình. Mất vài phút, web chỉ gián đoạn vài giây.

## Hay gặp

- Web báo lỗi gọi API: `pm2 logs sugami-api`, thường do `.env` thiếu hoặc MySQL/Redis chưa chạy.
- Đổi `.env`: `pm2 restart all --update-env`.
- Địa chỉ ngoài (`erp.sugami.vn`, `hooks.sugami.vn`) do Cloudflare Tunnel trỏ về cổng 3000 (web) và 4000 (API, webhook).
- Muốn thử code mới mà không ảnh hưởng bản đang chạy: dùng `pnpm dev` trên cổng khác, hoặc `pm2 stop all` trước rồi mới `pnpm dev`.
