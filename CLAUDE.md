# CLAUDE.md — Sugami ERP

Hệ thống quản lý shop đồ chơi (vài trăm SKU, < 10 đơn/ngày): kho & xuất nhập tồn, nguồn hàng Taobao/1688 qua đơn vị trung gian, media & content, đơn hàng đa kênh. Giai đoạn đầu kết nối Shopee/TikTok thông qua KiotViet Public API; dài hạn kết nối sàn trực tiếp và **thay KiotViet**.

Claude viết toàn bộ code và **commit thẳng lên `main`** (không mở PR, theo yêu cầu chủ shop). Chủ shop (iamcot) xem lại qua lịch sử commit và PROGRESS.

## Đọc trước khi làm

1. [`PROGRESS.md`](PROGRESS.md): trạng thái hiện tại, việc đang làm, việc bị chặn.
2. [`docs/09-ke-hoach-trien-khai.md`](docs/09-ke-hoach-trien-khai.md): định nghĩa từng task, phụ thuộc, tiêu chí hoàn thành.
3. Tài liệu liên quan trong [`docs/`](docs/README.md) (kiến trúc, mô hình dữ liệu, KiotViet API).

## Quy trình mỗi task

1. Chọn task ⬜ tiếp theo có đủ phụ thuộc ✅ (hoặc task chủ shop chỉ định). Không làm task 👤 thay chủ shop; chỉ chuẩn bị hướng dẫn.
2. Làm trên `main`: `git pull` trước, đánh 🟡 trong PROGRESS khi bắt đầu nếu task kéo dài nhiều phiên.
3. Làm task, viết test, chạy `pnpm lint && pnpm typecheck && pnpm test`. Chỉ push khi tất cả xanh; `main` phải luôn chạy được.
4. **Trong cùng commit cuối của task**: cập nhật `PROGRESS.md` (trạng thái ✅, hash commit ở cột PR/commit, dòng Nhật ký, bảng Tổng quan) và sửa tài liệu trong `docs/` nếu thiết kế thay đổi.
5. Commit message: `[P1-04] Short description` (tiếng Anh); thân commit ghi tiêu chí hoàn thành đã đạt và cách kiểm tra.
6. Task lớn có thể chia nhiều commit, cùng tiền tố ID; chỉ đánh ✅ ở commit cuối khi đạt đủ tiêu chí.
7. Quyết định mới hoặc thông tin chủ shop cung cấp → ghi vào mục "Quyết định đã chốt" của `PROGRESS.md` và `docs/08-quyet-dinh-va-cau-hoi.md`.

## Tech stack

- TypeScript strict, pnpm workspaces + Turborepo.
- `apps/web`: Next.js (App Router), Tailwind, shadcn/ui, TanStack Table/Query, React Hook Form + Zod.
- `apps/api`: NestJS (modular monolith). `apps/worker`: BullMQ.
- `packages/db`: Prisma + **MySQL 8.4** (`utf8mb4_0900_ai_ci`). `packages/shared`: Zod schema, kiểu, tiện ích. `packages/ui`. `packages/channels/{core,kiotviet,tiktok,shopee}`.
- Redis 7, MinIO (S3-compatible). Chạy bằng Docker Compose trên iMac của shop, ra internet qua Cloudflare Tunnel.

## Quy ước

- Code, tên biến, commit: tiếng Anh. Giao diện, tài liệu `docs/`, PROGRESS: tiếng Việt.
- Tiền: số nguyên (`BIGINT`) theo đồng VND; CNY theo xu. Số lượng: `DECIMAL(14,3)`.
- **Không bao giờ sửa tồn trực tiếp.** Mọi biến động tồn đi qua `stock_movement` (append-only) trong cùng transaction với `stock_level`.
- Mỗi thời điểm chỉ một hệ thống đẩy tồn lên sàn (hiện là KiotViet).
- Mọi chi tiết KiotViet/sàn nằm trong `packages/channels/*`; lõi chỉ dùng interface `ChannelAdapter`.
- Gọi API ngoài: qua rate limiter + retry có backoff; ghi ra ngoài qua `outbox` với idempotency key.
- Không commit secret. `.env` chỉ có trên máy chạy; cập nhật `.env.example` khi thêm biến.
- Dữ liệu mẫu từ KiotViet/sàn phải ẩn thông tin khách (tên, SĐT, địa chỉ) trước khi commit.
