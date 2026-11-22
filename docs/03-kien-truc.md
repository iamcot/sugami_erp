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
              │ PostgreSQL │  │ Redis      │  │ Object storage  │
              │ (dữ liệu,  │  │ (queue,    │  │ (S3/R2: ảnh,    │
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
          │ KiotViet (GĐ1)          │◀──│ /webhooks/kiotviet/:tok  │
          │ TikTok Shop API (GĐ4)   │   │ /webhooks/tiktok (GĐ4)   │
          │ Shopee Open API (GĐ4+)  │   └──────────────────────────┘
          └────────────┬───────────┘
                       ▼
           KiotViet ⇄ Shopee / TikTok / Lazada (liên kết sàn của KiotViet)
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
| Database | **PostgreSQL 16** | Giao dịch chắc chắn cho sổ kho, JSONB cho thuộc tính linh hoạt, full-text search |
| Queue/cache | **Redis** + **BullMQ** | Job đồng bộ, retry, lịch chạy, rate limit |
| Lưu file | S3-compatible (**Cloudflare R2** hoặc MinIO tự host) | Rẻ, không phí egress (R2) |
| Xử lý ảnh | **imgproxy** hoặc sharp trong worker | Resize, crop vuông 1:1 cho sàn, nén WebP, watermark |
| Tìm kiếm | PostgreSQL full-text + `pg_trgm` (GĐ1); Meilisearch nếu cần | Tìm tiếng Việt không dấu |
| Auth | Session cookie + RBAC tự quản (Lucia/better-auth) | Phân quyền theo vai trò, theo kho |
| Biểu đồ | Recharts / Tremor | Dashboard gọn |
| Quét mã | Camera trình duyệt (ZXing) trên PWA | Nhân viên kho dùng điện thoại, không cần máy quét |
| In ấn | HTML → PDF (Playwright) | Tem mã vạch, phiếu nhập, phiếu kiểm kho |
| Quan sát | Sentry + log JSON (pino) + Grafana/Uptime Kuma | Bắt lỗi đồng bộ sớm |
| Triển khai | Docker Compose trên 1 VPS (GĐ1–3), CI GitHub Actions | Chi phí thấp, đủ cho 1 shop; nâng cấp sau |

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
│     └─ tiktok/    # (GĐ4)
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
- Sao lưu Postgres hàng ngày (pgBackRest/`pg_dump` lên R2), giữ 30 ngày; thử khôi phục hàng tháng.

## 3.6 Hiệu năng mục tiêu

- 20.000 SKU, 2.000 đơn/ngày, 10 người dùng đồng thời trên VPS 4 vCPU / 8 GB.
- Trang danh sách < 500 ms, tìm SKU < 200 ms.
- Độ trễ đồng bộ tồn từ Sugami → KiotViet < 1 phút (sau đó tùy KiotViet → sàn).
