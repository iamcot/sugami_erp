# 9. Kế hoạch triển khai chi tiết

Tài liệu này chia lộ trình ở [07](07-lo-trinh.md) thành các task nhỏ. Mỗi task là một đơn vị công việc, commit thẳng lên `main` với tiền tố ID. Trạng thái từng task được theo dõi ở [`PROGRESS.md`](../PROGRESS.md).

Quy ước:

- **ID** dạng `P<giai đoạn>-<số>`, ví dụ `P1-04`. Dùng ID này làm tiền tố commit.
- **Phụ thuộc** ghi các task cần xong trước.
- **Hoàn thành khi** là tiêu chí nghiệm thu. Task chỉ được đánh ✅ khi đạt hết tiêu chí và đã lên `main`.
- Task có ký hiệu 👤 cần chủ shop làm hoặc cung cấp thông tin.

---

## P0 — Chuẩn bị & xác minh

| ID | Task | Phụ thuộc | Hoàn thành khi |
|----|------|-----------|----------------|
| P0-01 | Khởi tạo monorepo: pnpm workspaces, Turborepo, TypeScript strict, ESLint, Prettier, `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared`, `packages/ui`, `packages/channels/*` | – | `pnpm i && pnpm build && pnpm lint` chạy sạch |
| P0-02 | Docker Compose dev: Redis 7 (MySQL 8.4 native, có profile Docker cho máy khác/CI); file `.env.example`; script `pnpm dev` chạy cả web/api/worker | P0-01 | Một lệnh dựng được môi trường dev từ máy trống |
| P0-03 | CI GitHub Actions: lint, typecheck, test, build trên mỗi push lên `main` | P0-01 | Commit mẫu trên `main` có check xanh |
| P0-04 | Prisma schema khung (user, role, audit_log) + migration đầu + seed | P0-02 | `pnpm db:migrate && pnpm db:seed` chạy được |
| P0-05 | 👤 Cung cấp client_id/client_secret/tên gian hàng KiotViet (lưu vào `.env` trên iMac, **không commit**) | – | Có thông tin kết nối |
| P0-06 | Script `scripts/kiotviet-probe.ts`: lấy token, gọi `/branches`, `/categories`, `/products?includeInventory=true`, `/orders`, `/invoices`, `/purchaseorders`, `/suppliers`, `/webhooks`; lưu payload đã ẩn thông tin khách vào `docs/kiotviet-samples/` | P0-01, P0-05 | Có file mẫu cho từng tài nguyên |
| P0-07 | Báo cáo xác minh KiotViet `docs/kiotviet-verification.md`: đơn sàn là order hay invoice, mã đơn sàn, saleChannel, phí; tên sự kiện webhook Retail + cách ký (thử một webhook thật); giới hạn ghi; tạo phiếu nhập qua API có đẩy tồn lên sàn không | P0-06 | Mọi mục "cần xác minh" ở [02](02-kiotviet-api.md) có câu trả lời, cập nhật lại 02 |
| P0-08 | 👤 Đăng ký app Shopee Open Platform và TikTok Shop Partner Center (Claude soạn hướng dẫn từng bước, chủ shop thao tác) | – | Hồ sơ đã nộp, ghi lại trạng thái duyệt |
| P0-09 | Rà soát SKU: so khớp mã hàng KiotViet với SKU Shopee/TikTok (từ dữ liệu KiotViet + file xuất từ sàn), đề xuất quy tắc đặt mã | P0-06 | File báo cáo SKU trùng/thiếu/lệch + quy tắc đặt mã đã thống nhất |
| P0-10 | Prototype UI 5 màn hình (Tổng quan, Danh sách SP, Chi tiết SP, Nhận hàng mobile, Media) bằng Next.js + dữ liệu mẫu, deploy bản xem trước | P0-01 | 👤 Chủ shop duyệt |
| P0-11 | 👤 Chuẩn bị iMac: cài Docker (Docker Desktop hoặc Colima), tắt ngủ, tự khởi động sau mất điện, tự đăng nhập | – | `docker run hello-world` chạy trên iMac |
| P0-12 | Cloudflare Tunnel: tạo tunnel, gắn `erp.<tên miền>` và `hooks.<tên miền>`; hướng dẫn trong `docs/ops/imac-server.md` | P0-11 | Truy cập được trang thử từ 4G |
| P0-13 | Compose production + script sao lưu đêm (`mysqldump` + thư mục file → R2/Google Drive bằng rclone) + script khôi phục | P0-02, P0-11 | Khôi phục thử thành công trên máy khác |

## P1 — Nền tảng + catalog + kết nối KiotViet

| ID | Task | Phụ thuộc | Hoàn thành khi |
|----|------|-----------|----------------|
| P1-01 | Auth: đăng nhập email/mật khẩu, session cookie, đổi mật khẩu, khóa tài khoản | P0-04 | Test e2e đăng nhập/đăng xuất |
| P1-02 | RBAC: vai trò (Chủ shop, Kho, Vận hành, Content, Mua hàng), quyền theo module; guard API + ẩn menu FE | P1-01 | Test quyền cho từng vai trò |
| P1-03 | Audit log: middleware ghi thay đổi giá, tồn, xóa | P1-01 | Xem được lịch sử thay đổi một sản phẩm |
| P1-04 | Layout app: sidebar, topbar, command palette ⌘K, theme sáng/tối, mobile bottom nav, design tokens | P0-10 | Đúng prototype đã duyệt |
| P1-05 | Bộ component bảng dữ liệu dùng chung: lọc, sắp xếp, phân trang server, chọn nhiều, saved views, sửa tại chỗ | P1-04 | Dùng được cho danh sách SP |
| P1-06 | Schema catalog: category, brand, product, option, variant, unit_conversion, combo_item, price_list, external_ref | P0-04 | Migration + seed mẫu đồ chơi |
| P1-07 | API + màn hình nhóm hàng, thương hiệu | P1-05, P1-06 | CRUD đủ, cây nhóm 3 cấp |
| P1-08 | API + màn hình danh sách sản phẩm (bảng + lưới ảnh), tìm không dấu | P1-05, P1-06 | Tìm "xe dieu khien" ra "Xe điều khiển" |
| P1-09 | Chi tiết sản phẩm: tab Thông tin, Biến thể (sinh ma trận SKU theo quy tắc), thuộc tính đồ chơi (độ tuổi, chất liệu, pin, kích thước, chứng nhận) | P1-08 | Tạo SP 2 thuộc tính sinh đúng SKU |
| P1-10 | Import/export Excel sản phẩm, sửa hàng loạt | P1-08 | Import 300 dòng mẫu không lỗi |
| P1-11 | Package `channels/kiotviet`: client, token cache + làm mới, rate limiter, retry/backoff, mapper; contract test chạy với payload mẫu P0-06 | P0-07 | Test xanh với dữ liệu mẫu |
| P1-12 | Màn hình kết nối KiotViet: nhập thông tin (mã hóa secret), kiểm tra, chọn chi nhánh ↔ kho, xem trước | P1-11 | Kết nối được store thật |
| P1-13 | Import ban đầu: nhóm, sản phẩm/biến thể, chi nhánh, tồn, NCC, khách, đơn 90 ngày; có con trỏ chạy tiếp | P1-12 | Số SKU/tồn khớp KiotViet |
| P1-14 | Schema kho: warehouse, stock_level, stock_movement; ghi movement `kiotviet_sync` khi tồn thay đổi từ KiotViet | P1-13 | Thẻ kho mỗi SKU hiển thị biến động từ ngày import |
| P1-15 | Đồng bộ tăng dần (BullMQ, 10 phút/lần, `lastModifiedFrom`) cho sản phẩm, tồn, đơn, hóa đơn | P1-13 | Sửa giá trên KiotViet → Sugami cập nhật < 10 phút |
| P1-16 | Webhook receiver `/webhooks/kiotviet/:token`: lưu thô, chống trùng, trả 200 ngay, worker xử lý, kiểm chữ ký; tự đăng ký webhook khi kết nối | P1-15, P0-12 | Bán 1 đơn → Sugami cập nhật < 1 phút |
| P1-17 | Reconcile đêm + bảng `sync_issue` + màn hình Trung tâm đồng bộ (trạng thái, lỗi, chạy lại) | P1-15 | Chênh lệch giả lập hiện trên màn hình |
| P1-18 | Danh sách tồn kho (ma trận SKU × kho, tô màu mức tồn) | P1-14 | – |
| P1-19 | Danh sách đơn hàng (từ KiotViet), chi tiết đơn, lọc theo kênh | P1-15 | Đơn Shopee/TikTok phân biệt được kênh |
| P1-20 | Dashboard cơ bản: doanh thu/đơn hôm nay, 7/30 ngày, theo kênh; việc cần làm | P1-19 | – |
| P1-21 | Báo cáo sức khỏe dữ liệu: SKU trùng/thiếu, thiếu ảnh, tồn âm | P1-13 | – |
| P1-22 | Deploy production lên iMac, chạy song song 7 ngày | P0-13, P1-17 | 👤 Chủ shop xác nhận dữ liệu khớp |

## P2 — Nguồn hàng Taobao/1688 + kho

| ID | Task | Phụ thuộc | Hoàn thành khi |
|----|------|-----------|----------------|
| P2-01 | Schema sourcing: supplier, supplier_product, purchase_order(+line), forwarder, fx_rate, inbound_parcel(+line), landed_cost, supplier_payment | P1-06 | Migration |
| P2-02 | NCC (shop Taobao/1688): danh bạ, link shop, đánh giá; liên kết SKU ↔ link sản phẩm, giá CNY, lịch sử giá | P2-01 | – |
| P2-03 | Đơn vị trung gian: cấu hình bảng giá (đ/kg, đ/m³, lấy số lớn hơn hay không, phí mua hộ %, phí kiểm đếm, đóng gỗ) | P2-01 | – |
| P2-04 | Tỷ giá CNY/VND: nhập tay theo ngày (tùy chọn lấy tự động) | P2-01 | – |
| P2-05 | PO (đơn đặt hàng TQ): tạo từ đề xuất hoặc tay, nhiều link, trạng thái, tổng CNY & VND | P2-02, P2-04 | – |
| P2-06 | Kiện hàng: nhập mã vận đơn TQ, gắn PO line, trạng thái kiện | P2-05 | – |
| P2-07 | **Import Excel của đơn vị trung gian**: map cột (mã vận đơn, mã kiện, cân nặng, khối, phí, trạng thái), lưu mẫu map để dùng lại, khớp với kiện đã có | P2-06 | 👤 Chủ shop gửi 1–2 file mẫu; import đúng 100% dòng |
| P2-08 | Phân bổ landed cost về SKU (theo cân nặng / giá trị / số lượng), xem trước giá vốn | P2-06, P2-03 | Khớp tính tay trên 1 đợt hàng thật |
| P2-09 | Nhận hàng (mobile PWA): chọn kiện/PO, quét mã, nhập số lượng, ghi thiếu/lỗi + chụp ảnh, xác nhận | P2-08 | – |
| P2-10 | Phiếu kho: stock_document (nhập, xuất, chuyển, điều chỉnh), xác nhận sinh movement, hủy sinh movement đảo | P1-14 | Test sổ kho cân bằng |
| P2-11 | Giá vốn bình quân gia quyền cập nhật khi nhập | P2-10 | Test với các tình huống nhập nhiều đợt |
| P2-12 | Outbox → KiotViet: đẩy phiếu nhập/điều chỉnh, idempotent, retry | P2-10, P1-11 | Nhận kiện → tồn KiotViet + Shopee tăng đúng |
| P2-13 | Kiểm kho mobile: phiên kiểm, quét liên tục, offline, duyệt chênh lệch → phiếu điều chỉnh | P2-10 | 👤 Kiểm thật một kho |
| P2-14 | Thẻ kho + báo cáo xuất nhập tồn theo kỳ | P2-10 | Tồn đầu + nhập − xuất = tồn cuối |
| P2-15 | Cảnh báo sắp hết + đề xuất đặt hàng (tốc độ bán 30 ngày × thời gian hàng về) → tạo PO nháp | P2-05 | – |
| P2-16 | Công nợ & thanh toán NCC / trung gian | P2-05 | – |
| P2-17 | In tem mã vạch SKU | P1-09 | In được trên máy in tem của shop |

## P3 — Media & content

| ID | Task | Phụ thuộc | Hoàn thành khi |
|----|------|-----------|----------------|
| P3-01 | Schema media + lớp storage (local/S3), upload qua API | P0-02 | – |
| P3-02 | Thư viện media: lưới, tag, tìm, kéo thả hàng loạt, tự gán SKU theo tên file, phát hiện ảnh trùng | P3-01 | Tải 100 ảnh gán đúng SKU |
| P3-03 | Worker xử lý ảnh: thumbnail, vuông 1:1 1000px, WebP, watermark logo tùy chọn | P3-01 | – |
| P3-04 | Tab Ảnh trong chi tiết SP: sắp xếp, ảnh chính, ảnh theo biến thể/kênh | P3-02 | – |
| P3-05 | Tải gói ảnh (zip) theo chuẩn từng sàn; cảnh báo ảnh thiếu/kém chuẩn | P3-03 | – |
| P3-06 | Content theo kênh: tiêu đề (bộ đếm ký tự theo sàn), mô tả, bullet, từ khóa, cảnh báo an toàn theo độ tuổi; template; phiên bản; duyệt | P1-09 | – |
| P3-07 | Xem trước content như trên Shopee/TikTok | P3-06 | – |
| P3-08 | (Tùy chọn) Trợ lý AI: dịch/viết lại mô tả từ nội dung Taobao/1688, gợi ý tiêu đề | P3-06 | 👤 Chủ shop đồng ý dùng và có API key |

## P4 — Kết nối sàn trực tiếp

| ID | Task | Phụ thuộc | Hoàn thành khi |
|----|------|-----------|----------------|
| P4-01 | Interface `ChannelAdapter` + chuẩn hóa ExternalProduct/ExternalOrder | P1-11 | KiotViet adapter chuyển sang interface mới |
| P4-02 | TikTok Shop: OAuth, lưu/làm mới token, ký request | P0-08 (đã duyệt), P4-01 | Kết nối shop thật |
| P4-03 | TikTok Shop: đọc sản phẩm, ánh xạ listing ↔ SKU | P4-02 | – |
| P4-04 | TikTok Shop: đọc đơn + webhook, chế độ chỉ đọc so khớp với KiotViet | P4-02 | Khớp 100% trong 2 tuần |
| P4-05 | TikTok Shop: phí & đối soát → lãi theo đơn | P4-04 | – |
| P4-06 | TikTok Shop: tạo/sửa listing từ content + ảnh Sugami | P4-03, P3-06 | Tạo 1 listing mới từ Sugami |
| P4-07 | Shopee: OAuth, token, ký request | P0-08, P4-01 | Kết nối shop thật |
| P4-08 | Shopee: đọc sản phẩm, ánh xạ listing | P4-07 | – |
| P4-09 | Shopee: đọc đơn + push, chế độ chỉ đọc so khớp | P4-07 | Khớp 100% trong 2 tuần |
| P4-10 | Shopee: phí & đối soát | P4-09 | – |
| P4-11 | Shopee: tạo/sửa listing từ Sugami | P4-08, P3-06 | – |
| P4-12 | Báo cáo lãi gộp theo SKU/kênh/tháng | P4-05, P4-10, P2-11 | 👤 Chủ shop xác nhận số liệu |

## P5 — Thay KiotViet

| ID | Task | Phụ thuộc | Hoàn thành khi |
|----|------|-----------|----------------|
| P5-01 | Xử lý đơn trong Sugami: xác nhận, đóng gói quét đối chiếu, in phiếu, cập nhật trạng thái lên sàn | P4-04, P4-09 | – |
| P5-02 | Đổi trả: nhận hoàn, kiểm tra, nhập lại kho / ghi hỏng | P5-01 | – |
| P5-03 | Đơn thủ công (khách quen, Facebook/Zalo) | P5-01 | – |
| P5-04 | Đẩy tồn trực tiếp lên Shopee/TikTok (quy tắc tồn an toàn, % theo kênh) có công tắc bật/tắt | P4-03, P4-08 | – |
| P5-05 | Checklist chuyển đổi: tắt đồng bộ tồn KiotViet + bật P5-04 cùng lúc, chạy song song, nút quay lại | P5-04 | 👤 Chủ shop thực hiện theo checklist |
| P5-06 | Xuất & lưu trữ toàn bộ dữ liệu KiotViet | P5-05 | File lưu trữ đầy đủ |
| P5-07 | 30 ngày vận hành không KiotViet, gỡ adapter khỏi lịch chạy | P5-06 | 👤 Hủy gói KiotViet |

## P6 — Mở rộng (lên kế hoạch chi tiết sau)

Đơn Facebook/Zalo, website riêng, thông báo Telegram/Zalo, báo cáo tuổi tồn/ABC, lịch content.
