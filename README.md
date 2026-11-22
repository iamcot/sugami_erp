# Sugami ERP

Hệ thống quản lý shop đồ chơi: kho & xuất nhập tồn, nguồn hàng Taobao/1688, hình ảnh & content, đơn hàng đa kênh. Trước mắt trao đổi dữ liệu với KiotViet bằng file Excel; kết nối thẳng Shopee và TikTok Shop khi app được duyệt, rồi thay KiotViet.

- Kế hoạch: [`docs/`](docs/README.md)
- Tiến độ: [`PROGRESS.md`](PROGRESS.md)
- Quy ước làm việc: [`CLAUDE.md`](CLAUDE.md)

## Khởi tạo app lần đầu

Chi tiết hơn (cấu hình MySQL, chạy trong Docker): [`docs/ops/dev-setup.md`](docs/ops/dev-setup.md).

### 1. Cài phần mềm (macOS)

```bash
brew install node@22 mysql@8.4
brew services start mysql@8.4
corepack enable && corepack prepare pnpm@10.28.0 --activate
```

Cài thêm Docker Desktop (hoặc `brew install colima docker && colima start`) để chạy Redis.

Dùng **Podman** thay Docker cũng được: các lệnh `pnpm infra:*` tự nhận `podman` khi máy không có `docker`. Podman cần thêm công cụ compose và máy ảo đang chạy:

```bash
brew install podman-compose
podman machine init   # chỉ lần đầu
podman machine start
```

### 2. Lấy code

```bash
git clone https://github.com/iamcot/sugami_erp.git
cd sugami_erp
pnpm install
```

### 3. Tạo database

Mở `scripts/mysql-init.sql`, **đổi mật khẩu** `sugami-dev` thành mật khẩu riêng, rồi chạy:

```bash
mysql -uroot -p < scripts/mysql-init.sql
```

Script tạo database `sugami`, `sugami_shadow` (collation `utf8mb4_0900_ai_ci`) và user `sugami`.

### 4. Tạo file `.env`

```bash
cp .env.example .env
```

Sửa trong `.env`:

| Biến | Giá trị |
|------|---------|
| `DATABASE_URL`, `SHADOW_DATABASE_URL` | thay `sugami-dev` bằng mật khẩu ở bước 3 |
| `APP_ENCRYPTION_KEY` | chuỗi ngẫu nhiên: `openssl rand -base64 32` |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` | email và mật khẩu đăng nhập của chủ shop |
| `STORAGE_DRIVER` | `local` nếu chưa có key S3; `s3` kèm `S3_*` khi đã có (xem [`docs/ops/s3.md`](docs/ops/s3.md), kiểm tra bằng `pnpm storage:check`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | khóa thông báo đẩy, tạo bằng `pnpm vapid:generate` (xem [`docs/ops/pwa.md`](docs/ops/pwa.md)) |

`.env` chỉ nằm trên máy, không commit, không gửi qua chat.

### 5. Khởi tạo dữ liệu

```bash
pnpm infra:up      # Redis trong Docker
pnpm build         # build các package
pnpm db:deploy     # tạo bảng
pnpm db:seed       # vai trò, kho chính, tài khoản chủ shop
```

`pnpm db:seed` chạy lại bao nhiêu lần cũng được, không ghi đè tài khoản đã có. Muốn đổi mật khẩu chủ shop thì đổi trong app, không sửa `.env`.

### 6. Chạy

```bash
pnpm dev
```

- Giao diện: http://localhost:3000 (đăng nhập bằng `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`)
- API: http://localhost:4000/health

### Kiểm tra trước khi commit

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Lệnh thường dùng

| Lệnh | Việc |
|------|------|
| `pnpm dev` | chạy web (:3000), api (:4000), worker |
| `pnpm db:deploy` | áp migration mới sau khi `git pull` |
| `pnpm db:studio` | xem dữ liệu trong trình duyệt |
| `pnpm infra:down` | tắt Redis |
| `pnpm infra:mysql` | MySQL trong Docker (máy không có MySQL native) |

## Cài lên điện thoại

Sugami cài được như app và gửi thông báo đẩy: xem [`docs/ops/pwa.md`](docs/ops/pwa.md).
