# 3. Kiến trúc & tech stack

## 3.1 Sơ đồ tổng thể

```
                    ┌──────────────────────────────────────────┐
  Trình duyệt /     │  Web app (Next.js, PWA)                   │
  điện thoại kho ──▶│  Dashboard · Sản phẩm · Kho · Đơn · NCC  │
                    │  Media · Content · Báo cáo · Cài đặt     │
                    └───────────────┬──────────────────────────┘
                                    │ HTTPS (REST/JSON, typed client)
                    ┌───────────────▼──────────────────────────┐
                    │  API (NestJS, modular monolith)           │
                    │  catalog · inventory · orders · sourcing  │
                    │  media · content · reports · auth · sync  │
                    └──┬─────────────┬───────────────┬─────────┘
                       │             │               │
              ┌────────▼───┐  ┌──────▼─────┐  ┌──────▼──────────┐
              │ MySQL 8    │  │ Redis      │  │ Object storage  │
              │ (dữ liệu,  │  │ (queue,    │  │ (AWS S3: ảnh,   │
              │  sổ kho)   │  │  cache,    │  │  video, file)   │
              └────────▲───┘  │  rate-lim) │  └──────▲──────────┘
                       │      └──────▲─────┘         │
                    ┌──┴─────────────┴───────────────┴─────────┐
                    │  Worker (BullMQ)                          │
                    │  sync KiotViet · webhook · outbox · ảnh   │
                    │  reconcile · báo cáo · thông báo          │
                    └──┬──────────────────────────┬─────────────┘
                       │                          │
          ┌────────────▼───────────┐   ┌──────────▼──────────────┐
          │ Channel adapters        │   │ Webhook receiver         │
          │ KiotViet: file Excel    │   │ (không có webhook KV)    │
          │ TikTok Shop API (GĐ4)   │   │ /webhooks/tiktok (GĐ4)   │
          │ Shopee Open API (GĐ4)   │   │ /webhooks/shopee (GĐ4)   │
          │ Trung gian ship (GĐ2)   │   └──────────────────────────┘
          └────────────┬───────────┘
                       ▼
   GĐ1–4: KiotViet ⇄ Shopee / TikTok (liên kết sàn của KiotViet);
          Sugami ⇄ KiotViet bằng import/export Excel
   GĐ5+:  Sugami ⇄ Shopee / TikTok trực tiếp, gỡ KiotViet
```

## 3.2 Tech stack đề xuất

| Lớp | Lựa chọn | Lý do |
|-----|----------|-------|
| Ngôn ngữ | **TypeScript** toàn bộ | Một ngôn ngữ cho FE/BE/worker, dùng chung kiểu dữ liệu |
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `apps/api`, `apps/worker`, `packages/*` |
| Frontend | **Next.js** (App Router) + React + **Tailwind CSS** + **shadcn/ui** | Giao diện hiện đại, nhanh, nhiều component sẵn, dễ tùy biến |
| Bảng dữ liệu | TanStack Table + TanStack Query | Bảng lớn, lọc/sắp xếp/phân trang phía server |
| Form | React Hook Form + Zod | Validate dùng chung schema với backend |
| Backend | **NestJS** (modular monolith) | Cấu trúc module rõ, DI, dễ test; tách service sau nếu cần |
| ORM | **Prisma** (hoặc Drizzle) | Migration rõ ràng, type-safe |
| Database | **MySQL 8.4 LTS** (InnoDB, `utf8mb4_0900_ai_ci`) | Chủ shop chọn; đủ giao dịch cho sổ kho, cột `JSON` cho thuộc tính linh hoạt; collation `ai_ci` giúp tìm tiếng Việt không dấu sẵn |
| Queue/cache | **Redis** + **BullMQ** | Job đồng bộ, retry, lịch chạy, rate limit |
| Lưu file | **AWS S3 có sẵn của shop** qua lớp `storage` (driver `s3`, prefix `sugami/`); driver `local` cho dev/offline | Ảnh an toàn ngoài iMac, không phải tự sao lưu, link ảnh dùng được từ mọi nơi |
| Xử lý ảnh | **imgproxy** hoặc sharp trong worker | Resize, crop vuông 1:1 cho sàn, nén WebP, watermark |
| Tìm kiếm | MySQL `LIKE` trên collation `ai_ci` + FULLTEXT (ngram) | Tìm tiếng Việt không dấu; dư sức cho vài trăm SKU |
| Auth | Session cookie + RBAC tự quản (Lucia/better-auth) | Phân quyền theo vai trò, theo kho |
| Biểu đồ | Recharts / Tremor | Dashboard gọn |
| Quét mã | Camera trình duyệt (ZXing) trên PWA | Nhân viên kho dùng điện thoại, không cần máy quét |
| In ấn | HTML → PDF (Playwright) | Tem mã vạch, phiếu nhập, phiếu kiểm kho |
| Quan sát | Sentry + log JSON (pino) + Grafana/Uptime Kuma | Bắt lỗi đồng bộ sớm |
| Triển khai | Docker Compose trên **iMac của shop** + Cloudflare Tunnel; CI GitHub Actions | Không tốn tiền server; chuyển lên VPS chỉ cần copy compose + dữ liệu |

## 3.3 Cấu trúc repo dự kiến

```
sugami_erp/
├─ apps/
│  ├─ web/          # Next.js
│  ├─ api/          # NestJS
│  └─ worker/       # BullMQ workers (dùng chung code module với api)
├─ packages/
│  ├─ db/           # Prisma schema, migration, seed
│  ├─ shared/       # Zod schema, kiểu, hằng số, tiện ích tiền tệ/ngày
│  ├─ ui/           # Component dùng chung (trên shadcn/ui)
│  └─ channels/
│     ├─ core/      # Interface ChannelAdapter
│     ├─ kiotviet/  # Client KiotViet: auth, rate limit, mapper
│     ├─ tiktok/    # (GĐ4)
│     └─ shopee/    # (GĐ4)
├─ docs/
├─ docker-compose.yml
└─ .github/workflows/
```

## 3.4 Interface adapter kênh

Mọi kênh cài đặt cùng một interface, để lõi không biết chi tiết từng kênh:

```ts
interface ChannelAdapter {
  code: 'kiotviet' | 'tiktok' | 'shopee' | 'lazada' | 'manual';
  capabilities: {
    pullProducts: boolean; pushProducts: boolean;
    pullStock: boolean;   pushStock: boolean;
    pullOrders: boolean;  updateOrderStatus: boolean;
    pushListingContent: boolean; webhooks: boolean;
  };
  pullProducts(since?: Date): AsyncIterable<ExternalProduct>;
  pullOrders(since?: Date): AsyncIterable<ExternalOrder>;
  pushStock(items: StockPush[]): Promise<PushResult[]>;
  pushProduct?(p: ProductPush): Promise<PushResult>;
  verifyWebhook(req: RawRequest): boolean;
  parseWebhook(req: RawRequest): ChannelEvent[];
}
```

## 3.5 Bảo mật

- Mã hóa `client_secret` KiotViet và token sàn trong DB (AES-GCM, khóa trong biến môi trường).
- RBAC: vai trò + quyền theo module + giới hạn theo kho/chi nhánh.
- Nhật ký thao tác (audit log) cho mọi thay đổi giá, tồn, xóa.
- Webhook URL chứa token ngẫu nhiên + kiểm tra chữ ký HMAC.
- Sao lưu MySQL (`mysqldump`) (ảnh đã nằm trên S3, bật versioning cho bucket để chống xóa nhầm) hàng đêm ra **ngoài iMac** (Cloudflare R2 gói miễn phí 10 GB hoặc Google Drive bằng rclone), giữ 30 ngày; thử khôi phục hàng tháng.

## 3.6 Hiệu năng mục tiêu

- Quy mô hiện tại (vài trăm SKU, < 10 đơn/ngày, vài người dùng) chạy thoải mái trên iMac, cả hệ thống dùng khoảng 2–3 GB RAM. Thiết kế vẫn chịu được 20.000 SKU và 2.000 đơn/ngày khi cần.
- Trang danh sách < 500 ms, tìm SKU < 200 ms.
- Độ trễ đồng bộ tồn từ Sugami → KiotViet < 1 phút (sau đó tùy KiotViet → sàn).

## 3.7 Chạy server trên iMac

Chủ shop có một iMac bật cả ngày, dùng luôn làm server.

**Các container (Docker Compose):** `web` (Next.js), `api` (NestJS), `worker`, `redis`, `cloudflared`. **MySQL 8.4 cài native** trên iMac (Homebrew hoặc bộ cài DMG), các container kết nối qua `host.docker.internal`. Một lệnh `docker compose up -d` là chạy toàn bộ phần còn lại.

**Cài đặt:**

- Docker: **Docker Desktop** (miễn phí cho doanh nghiệp nhỏ) hoặc **Colima** (mã nguồn mở, nhẹ hơn). Đặt tự khởi động khi đăng nhập; container đặt `restart: unless-stopped`.
- macOS: tắt chế độ ngủ (Cài đặt → Màn hình khóa / Năng lượng: "Ngăn máy tự ngủ", bật "Khởi động lại sau khi mất điện"), bật tự đăng nhập để Docker lên lại sau khi khởi động lại.
- Nên có **UPS** nhỏ để chống mất điện đột ngột làm hỏng dữ liệu.
- iMac Intel hay Apple Silicon đều chạy được; các image dùng bản multi-arch.

**Truy cập từ ngoài & webhook:**

- KiotViet, Shopee, TikTok cần gọi webhook vào một địa chỉ **HTTPS công khai**. Dùng **Cloudflare Tunnel** (miễn phí): không cần mở cổng modem, không cần IP tĩnh, tự có HTTPS. Cần một tên miền (khoảng 250–300 nghìn ₫/năm), tên miền của shop là **sugami.vn**: giao diện ở `erp.sugami.vn`, webhook ở `hooks.sugami.vn` (cả hai qua Cloudflare Tunnel).
- Chặn truy cập giao diện bằng đăng nhập của Sugami; có thể thêm Cloudflare Access để chỉ email của shop vào được.

**Rủi ro & cách giảm:**

| Rủi ro | Giảm thiểu |
|--------|-----------|
| Mất điện/mất mạng, iMac tắt | UPS; webhook bị lỡ sẽ được job đồng bộ tăng dần và reconcile bù lại khi máy lên |
| Hỏng ổ cứng, mất máy | Sao lưu hàng đêm ra ngoài iMac, thử khôi phục hàng tháng |
| Cập nhật macOS tự khởi động lại | Tắt tự cài cập nhật, cập nhật thủ công ngoài giờ |
| Cần mở rộng | Cùng file Docker Compose chạy được trên VPS; chuyển bằng dump MySQL (ảnh đã ở S3) |
