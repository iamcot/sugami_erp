# PROGRESS — Sugami ERP

Theo dõi tiến độ triển khai. Chi tiết từng task (phụ thuộc, tiêu chí hoàn thành) ở [docs/09-ke-hoach-trien-khai.md](docs/09-ke-hoach-trien-khai.md).

**Trạng thái:** ⬜ chưa làm · 🟡 đang làm · ✅ xong · ⏸ tạm ngưng · ⛔ bị chặn · 👤 cần chủ shop

Mọi thay đổi commit thẳng lên `main` với tiền tố ID task, ví dụ `[P1-04] ...`.

## Tổng quan

| Giai đoạn | Tiến độ | Ghi chú |
|-----------|---------|---------|
| P0 — Chuẩn bị & xác minh | 6/13 | Khung dự án xong; P0-10 chờ duyệt; chờ file Excel KiotViet và hồ sơ app sàn |
| P1 — Nền tảng + catalog + kho (dữ liệu từ Excel KiotViet) | 8/22 | |
| P2 — Nguồn hàng Taobao/1688 + kho | 0/17 | |
| P3 — Media & content | 0/8 | |
| P4 — Kết nối sàn trực tiếp | 0/15 | Đang thử Pancake POS làm lớp trung gian |
| P5 — Thay KiotViet | 0/7 | |
| P6 — Mở rộng | – | Lên kế hoạch sau P5 |

## Đang làm

- P0-10 chờ duyệt giao diện.
- Tiếp theo: P1-18 danh sách tồn kho, P1-20 dashboard số thật, P1-13 xuất phiếu nhập/kiểm kho sang KiotViet, P1-15 đối chiếu tồn.

## Bị chặn / chờ chủ shop

- P0-08: **nộp hồ sơ ngay** app Shopee Open Platform và TikTok Shop Partner Center (hướng dẫn: docs/ops/dang-ky-app-san.md).
- P0-11: cài Docker trên iMac.
- Pancake: mở bản thử, nối Shopee/TikTok (tắt đồng bộ tồn), thử 1 SKU, điền `PANCAKE_*` vào `.env`, chạy `pnpm --filter @sugami/channels-pancake probe` (docs/pancake.md).
- P3-01: tạo IAM user/key và cấu hình CORS theo docs/ops/s3.md, điền `.env`, chạy `pnpm storage:check`; cho biết region, folder, có CloudFront không.
- P2-07: gửi 1–2 file Excel mẫu của đơn vị vận chuyển trung gian.

## Quyết định đã chốt

- 2026-11-22: Hóa đơn KiotViet chỉ trừ tồn Sugami nếu bán sau thời điểm xuất file tồn đầu kỳ của mã đó; khách hàng chỉ lưu mã KiotViet.
- 2026-11-22: Hàng vào KiotViet qua phiếu nhập; mã mới tạo trên KiotViet bằng file mẫu import hàng hóa do Sugami xuất (`MauFileSanPham`), import trước phiếu nhập.
- 2026-11-22: Mã hàng KiotViet là SKU, giữ nguyên; biến thể gom theo `Mã HH Liên quan` (D10). Shop có 1.029 mã hàng (nhiều hơn ước tính ban đầu).
- 2026-11-22: Chạy trên KiotViet trước, dài hạn thay KiotViet; Sugami tự giữ sổ kho từ đầu.
- 2026-11-22: Server là iMac của shop, Docker Compose, Cloudflare Tunnel. Tên miền **sugami.vn**: `erp.sugami.vn` (giao diện), `hooks.sugami.vn` (webhook).
- 2026-11-22: MySQL 8.4 cài **native** trên iMac, không chạy trong Docker; container kết nối qua `host.docker.internal`.
- 2026-11-22: Bỏ MinIO. Ảnh/video lưu trên **AWS S3 có sẵn của shop** (driver `s3`, prefix `sugami/`); driver `local` chỉ dùng cho dev/offline.
- 2026-11-22: Gói KiotViet Chuyên nghiệp của shop **không có Public API** (chỉ gói Cao cấp). Chủ shop chọn: không nâng gói; **kết nối thẳng Shopee/TikTok**, trong lúc chờ duyệt app thì trao đổi với KiotViet bằng **file Excel**. P0-06 probe tạm ngưng.
- 2026-11-22: Đơn vị trung gian không có API, chỉ có file Excel → import Excel (P2-07).
- 2026-11-22: Stack thực tế: Node 22, pnpm 10, TypeScript 6, Next.js 16, NestJS 12, Prisma 7 (MariaDB adapter), BullMQ 6 + ioredis, Tailwind 4, Vitest 5.
- 2026-11-22: Claude viết toàn bộ code, commit thẳng lên `main` (không PR); mỗi task cập nhật file này trong commit cuối.
- 2026-11-22: Chủ shop chọn **dùng thử Pancake POS 15 ngày** (200k/tháng, đối tác TikTok) làm lớp trung gian thay KiotViet (D11, docs/pancake.md). Trong lúc thử, KiotViet vẫn là bên duy nhất đẩy tồn.

## Nhật ký

| Ngày | Việc | Commit |
|------|------|-----------|
| 2026-11-22 | Hoàn thành bộ tài liệu kế hoạch (docs/01–09), PROGRESS.md, CLAUDE.md | main |
| 2026-11-22 | P0-01 monorepo: web/api/worker + shared/ui/channels-core/db | 1fea4d9 |
| 2026-11-22 | P0-02 Docker Compose (Redis; MySQL native), bỏ MinIO, docs/ops/dev-setup.md | 726704e |
| 2026-11-22 | P0-04 Prisma 7 + MySQL: users/roles/audit_logs, collation 0900_ai_ci, seed | 2c78005 |
| 2026-11-22 | P0-03 CI GitHub Actions (MySQL + Redis services) | 2a53d81 |
| 2026-11-22 | Ảnh lưu trên AWS S3 có sẵn của shop | 3d62b98 |
| 2026-11-22 | P1-06 + P1-14 schema sản phẩm, kho và sổ kho (test trên MySQL) | aaf6f99 |
| 2026-11-22 | P0-10 prototype giao diện 5 màn hình (dữ liệu mẫu) | 84065e7 |
| 2026-11-22 | P0-06 client KiotViet + script probe chỉ đọc (chưa chạy với store thật) | e3c0d6e |
| 2026-11-22 | P1-01/P1-02 đăng nhập, phân quyền, trang /login; tài khoản chủ shop tạo bằng `pnpm db:seed` | c799ed3 |
| 2026-11-22 | P1-03 nhật ký thay đổi + API lịch sử sản phẩm; README hướng dẫn khởi tạo; infra hỗ trợ Podman | f971be5 |
| 2026-11-22 | P3-01 lớp lưu trữ S3/local, schema media, API upload ký sẵn, `pnpm storage:check` (chờ thử bucket thật) | 9c19840 |
| 2026-11-22 | P0-07 phân tích file Excel KiotViet (1.029 mã hàng, 153 nhóm biến thể, hóa đơn Shopee) | 117ab2d |
| 2026-11-22 | P1-11 import danh sách hàng hóa KiotViet (xem trước, tồn đầu kỳ, chạy lại an toàn) + màn hình Nhập KiotViet | f5d2bbf |
| 2026-11-22 | P1-12 import hóa đơn KiotViet thành đơn hàng (kênh, trạng thái, trừ tồn sau tồn đầu kỳ, hoàn tồn khi hủy); sửa .gitignore làm sót trang Nhập KiotViet | a610588 |
| 2026-11-22 | P1-08 danh sách sản phẩm/đơn hàng trên dữ liệu thật, chi tiết sản phẩm có lịch sử, bảng dữ liệu dùng chung | 5e7493e |
| 2026-11-22 | P1-18/P1-20 API tồn kho theo SKU × kho và API tổng quan (chưa có giao diện) | 83dc4cc |
| 2026-11-22 | P4-P1 nối Pancake POS (chỉ đọc): client, ánh xạ sản phẩm/đơn, webhook vào `webhook_events`, `probe` | (commit này) |

## P0 — Chuẩn bị & xác minh

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|-----------|----|---------|
| P0-01 | Khởi tạo monorepo | ✅ | 1fea4d9 | |
| P0-02 | Docker Compose dev | ✅ | 726704e | |
| P0-03 | CI GitHub Actions: lint, typecheck, test, build trên mỗi PR | ✅ | 2a53d81 | |
| P0-04 | Prisma schema khung (user, role, audit_log) + migration đầu + seed | ✅ | 2c78005 | |
| P0-05 | Xuất file Excel mẫu từ KiotViet (hàng hóa + tồn, hóa đơn, phiếu nhập, NCC, mẫu import) | 👤 ✅ | | Đủ file (22/11): danh sách hàng hóa, hóa đơn, phiếu nhập, NCC, mẫu nhập hàng, kiểm kho, hàng hóa |
| P0-06 | Script probe KiotViet Public API | ⏸ | e3c0d6e | Tạm ngưng: gói hiện tại không có API |
| P0-07 | Phân tích file Excel KiotViet (`docs/kiotviet-excel.md`) | ✅ | 117ab2d | |
| P0-08 | Đăng ký app Shopee Open Platform và TikTok Shop Partner Center | 👤 ⬜ | | |
| P0-09 | Rà soát SKU | ⬜ | | |
| P0-10 | Prototype UI 5 màn hình | 🟡 | 84065e7 | Chờ chủ shop duyệt giao diện |
| P0-11 | Chuẩn bị iMac | 👤 ⬜ | | |
| P0-12 | Cloudflare Tunnel | ⬜ | | |
| P0-13 | Compose production + script sao lưu đêm | ⬜ | | |

## P1 — Nền tảng + catalog + kho (dữ liệu từ Excel KiotViet)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|-----------|----|---------|
| P1-01 | Auth | ✅ | c799ed3 | Cookie phiên httpOnly, khóa 15 phút sau 5 lần sai |
| P1-02 | RBAC | ✅ | c799ed3 | Guard toàn cục, quyền `*` / `module.*` |
| P1-03 | Audit log: middleware ghi thay đổi giá, tồn, xóa | ✅ | f971be5 | Tồn xem qua stock_movement |
| P1-04 | Layout app | ⬜ | | |
| P1-05 | Bộ component bảng dữ liệu dùng chung | 🟡 | 5e7493e | Có sắp xếp, phân trang server, lọc qua URL; còn chọn nhiều, saved views, sửa tại chỗ |
| P1-06 | Schema catalog | ✅ | aaf6f99 | |
| P1-07 | API + màn hình nhóm hàng, thương hiệu | ⬜ | | |
| P1-08 | API + màn hình danh sách sản phẩm, tìm không dấu | ✅ | 5e7493e | Chưa có lưới ảnh (chờ ảnh ở P3) |
| P1-09 | Chi tiết sản phẩm | 🟡 | 5e7493e | Xem biến thể, giá vốn, tồn, lịch sử; chưa sửa/tạo SP, sinh ma trận SKU |
| P1-10 | Import/export Excel sản phẩm, sửa hàng loạt | ⬜ | | |
| P1-11 | Import Excel hàng hóa + tồn từ KiotViet | ✅ | f5d2bbf | File thật: 1.029 SKU, 12.257 cái, khớp 100% |
| P1-12 | Import Excel hóa đơn/đặt hàng KiotViet → đơn hàng | ✅ | a610588 | File thật: 38 đơn, doanh thu khớp file tổng quan |
| P1-13 | Export Excel phiếu nhập/kiểm kho theo mẫu import KiotViet | ⬜ | | |
| P1-14 | Schema kho: warehouse, stock_level, stock_movement | ✅ | aaf6f99 | |
| P1-15 | Đối chiếu tồn file KiotViet ↔ sổ kho Sugami | ⬜ | | |
| P1-16 | Trung tâm dữ liệu: lịch sử import/export | ⬜ | | |
| P1-17 | Nhắc việc đồng bộ Excel trên dashboard | ⬜ | | |
| P1-18 | Danh sách tồn kho (ma trận SKU × kho, tô màu mức tồn) | ⬜ | | |
| P1-19 | Danh sách đơn hàng, chi tiết đơn, lọc theo kênh | 🟡 | 5e7493e | Danh sách + lọc kênh/trạng thái + API chi tiết; chưa có trang chi tiết đơn |
| P1-20 | Dashboard cơ bản | ⬜ | | |
| P1-21 | Báo cáo sức khỏe dữ liệu: SKU trùng/thiếu, thiếu ảnh, tồn âm | ⬜ | | |
| P1-22 | Deploy production lên iMac, dùng thật 1 tuần | 👤 ⬜ | | |

## P2 — Nguồn hàng Taobao/1688 + kho

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|-----------|----|---------|
| P2-01 | Schema sourcing | ⬜ | | |
| P2-02 | NCC | ⬜ | | |
| P2-03 | Đơn vị trung gian | ⬜ | | |
| P2-04 | Tỷ giá CNY/VND: nhập tay theo ngày (tùy chọn lấy tự động) | ⬜ | | |
| P2-05 | PO | ⬜ | | |
| P2-06 | Kiện hàng: nhập mã vận đơn TQ, gắn PO line, trạng thái kiện | ⬜ | | |
| P2-07 | **Import Excel của đơn vị trung gian** | ⬜ | | |
| P2-08 | Phân bổ landed cost về SKU | ⬜ | | |
| P2-09 | Nhận hàng | ⬜ | | |
| P2-10 | Phiếu kho | ⬜ | | |
| P2-11 | Giá vốn bình quân gia quyền cập nhật khi nhập | ⬜ | | |
| P2-12 | Outbox → KiotViet: đẩy phiếu nhập/điều chỉnh, idempotent, retry | ⬜ | | |
| P2-13 | Kiểm kho mobile | ⬜ | | |
| P2-14 | Thẻ kho + báo cáo xuất nhập tồn theo kỳ | ⬜ | | |
| P2-15 | Cảnh báo sắp hết + đề xuất đặt hàng | ⬜ | | |
| P2-16 | Công nợ & thanh toán NCC / trung gian | ⬜ | | |
| P2-17 | In tem mã vạch SKU | ⬜ | | |

## P3 — Media & content

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|-----------|----|---------|
| P3-01 | Schema media + lớp storage (local/S3), upload qua API | 🟡 | 9c19840 | Code xong; chờ chủ shop chạy `pnpm storage:check` với bucket thật |
| P3-02 | Thư viện media | ⬜ | | |
| P3-03 | Worker xử lý ảnh | ⬜ | | |
| P3-04 | Tab Ảnh trong chi tiết SP: sắp xếp, ảnh chính, ảnh theo biến thể/kênh | ⬜ | | |
| P3-05 | Tải gói ảnh (zip) theo chuẩn từng sàn; cảnh báo ảnh thiếu/kém chuẩn | ⬜ | | |
| P3-06 | Content theo kênh | ⬜ | | |
| P3-07 | Xem trước content như trên Shopee/TikTok | ⬜ | | |
| P3-08 |  | ⬜ | | |

## P4 — Kết nối sàn trực tiếp (bắt đầu ngay khi app được duyệt, chạy song song P2–P3)

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|-----------|----|---------|
| P4-P1 | Pancake: client API, đọc sản phẩm/tồn/đơn, nhận webhook vào `webhook_events`, lệnh `probe` | 🟡 | | Chờ chạy `probe` trên shop thật |
| P4-P2 | Pancake: worker xử lý webhook + quét bù, ghi đơn và trừ tồn theo đơn | ⬜ | | |
| P4-P3 | Pancake: đẩy tồn từ Sugami (outbox), tắt đồng bộ tồn KiotViet | ⬜ | | Sau khi thử 1 SKU đạt |
| P4-01 | Interface `ChannelAdapter` + chuẩn hóa ExternalProduct/ExternalOrder | ⬜ | | |
| P4-02 | TikTok Shop: OAuth, lưu/làm mới token, ký request | ⬜ | | |
| P4-03 | TikTok Shop: đọc sản phẩm, ánh xạ listing ↔ SKU | ⬜ | | |
| P4-04 | TikTok Shop: đọc đơn + webhook, chế độ chỉ đọc so khớp với KiotViet | ⬜ | | |
| P4-05 | TikTok Shop: phí & đối soát → lãi theo đơn | ⬜ | | |
| P4-06 | TikTok Shop: tạo/sửa listing từ content + ảnh Sugami | ⬜ | | |
| P4-07 | Shopee: OAuth, token, ký request | ⬜ | | |
| P4-08 | Shopee: đọc sản phẩm, ánh xạ listing | ⬜ | | |
| P4-09 | Shopee: đọc đơn + push, chế độ chỉ đọc so khớp | ⬜ | | |
| P4-10 | Shopee: phí & đối soát | ⬜ | | |
| P4-11 | Shopee: tạo/sửa listing từ Sugami | ⬜ | | |
| P4-12 | Báo cáo lãi gộp theo SKU/kênh/tháng | ⬜ | | |

## P5 — Thay KiotViet

| ID | Task | Trạng thái | Commit | Ghi chú |
|----|------|-----------|----|---------|
| P5-01 | Xử lý đơn trong Sugami | ⬜ | | |
| P5-02 | Đổi trả: nhận hoàn, kiểm tra, nhập lại kho / ghi hỏng | ⬜ | | |
| P5-03 | Đơn thủ công (khách quen, Facebook/Zalo) | ⬜ | | |
| P5-04 | Đẩy tồn trực tiếp lên Shopee/TikTok | ⬜ | | |
| P5-05 | Checklist chuyển đổi | ⬜ | | |
| P5-06 | Xuất & lưu trữ toàn bộ dữ liệu KiotViet | ⬜ | | |
| P5-07 | 30 ngày vận hành không KiotViet, gỡ adapter khỏi lịch chạy | ⬜ | | |
