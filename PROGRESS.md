# PROGRESS — Sugami ERP

Theo dõi tiến độ triển khai. Chi tiết từng task (phụ thuộc, tiêu chí hoàn thành) ở [docs/09-ke-hoach-trien-khai.md](docs/09-ke-hoach-trien-khai.md).

**Trạng thái:** ⬜ chưa làm · 🟡 đang làm · ✅ xong · ⏸ tạm ngưng · ⛔ bị chặn · 👤 cần chủ shop

Mọi thay đổi commit thẳng lên `main` với tiền tố ID task, ví dụ `[P1-04] ...`.

## Tổng quan

| Giai đoạn | Tiến độ | Ghi chú |
|-----------|---------|---------|
| P0 — Chuẩn bị & xác minh | 6/13 | Khung dự án và phân tích file KiotViet xong; còn P0-10 chờ duyệt, P0-08 hồ sơ app sàn, P0-11/12/13 iMac |
| P1 — Nền tảng + catalog + kho (dữ liệu từ Excel KiotViet) | 12/24 | Import, tồn kho, tổng quan, phiếu kho, PWA đã chạy trên dữ liệu thật; P1-13 chờ thử KiotViet; còn đối chiếu tồn, trung tâm dữ liệu, nhắc việc, sức khỏe dữ liệu |
| P2 — Nguồn hàng Taobao/1688 + kho | 0/17 | |
| P3 — Media & content | 0/8 | |
| P4 — Kết nối sàn trực tiếp | 1/15 | Đang thử Pancake POS làm lớp trung gian (P4-P1 xong) |
| P5 — Thay KiotViet | 0/7 | |
| P6 — Mở rộng | – | Lên kế hoạch sau P5 |

## Đang làm

- P0-10 chờ duyệt giao diện.
- P4-P2 (Pancake tự kéo đơn, trừ tồn, báo đơn mới): chờ chủ shop xác nhận phạm vi rồi làm; không cần webhook.
- Việc kế tiếp phía Claude: P1-15 đối chiếu tồn, P1-16 trung tâm dữ liệu, P1-17 nhắc việc, P1-21 sức khỏe dữ liệu, P1-19 trang chi tiết đơn.

## Đã hoàn thành

- **Nền tảng:** monorepo, CI, đăng nhập + phân quyền, nhật ký thay đổi (P0-01..04, P1-01..03, P1-06, P1-14).
- **Dữ liệu từ KiotViet:** import hàng hóa + tồn (1.029 SKU khớp 100%) và hóa đơn (38 đơn, doanh thu khớp) từ file Excel thật (P1-11, P1-12); tài liệu định dạng file (P0-07).
- **Giao diện thật:** sản phẩm, đơn hàng, tồn kho, tổng quan, phiếu kho (P1-08, P1-18, P1-20), cài lên điện thoại + thông báo đẩy (P1-23).
- **Xuất sang KiotViet:** phiếu nhập, kiểm kho, sản phẩm mới đúng mẫu import (P1-13, chờ thử thật).
- **Media:** lớp lưu trữ S3/local + API upload (P3-01, chờ thử bucket thật).
- **Pancake POS:** client, ánh xạ, hộp thư webhook, lệnh kiểm tra `pnpm pancake:probe` (P4-P1). Đã chạy trên shop thật: nối được 4 kênh, Pancake chưa có sản phẩm/đơn.

## Bị chặn / chờ chủ shop

**Pancake (đang dùng thử 15 ngày từ 22/11):**
- Thử **1 SKU** trọn vòng: tạo sản phẩm Pancake đúng mã hàng KiotViet, liên kết với listing Shopee, sửa tồn, xem sàn có cập nhật không và sau bao lâu. Đạt thì làm P4-P3, không đạt thì quay lại KiotViet + Excel.
- Hiện có 625 listing đã kéo về Pancake nhưng 0 liên kết.
- Trả lời: shop Shopee MY và PH có cần quản lý đơn/tồn trong Sugami không, hay chỉ shop VN?
- Webhook (tùy chọn, sau khi iMac chạy ổn): cần `hooks.sugami.vn` đã qua Cloudflare Tunnel; cấu hình theo docs/pancake.md.
- Khi có đơn thật đầu tiên: chạy lại `pnpm pancake:probe` để xác nhận mã sàn TikTok (-9) và cách đơn gắn ID tài khoản.

**Việc khác:**
- P1-13: thử import vào KiotViet các file từ trang KiotViet → Xuất sang KiotViet và trang Phiếu kho; báo KiotViet có nhận không.
- P1-23: tạo khóa thông báo (`pnpm vapid:generate`), cài app lên điện thoại, thử thông báo (docs/ops/pwa.md). Nên đăng ký UptimeRobot/Healthchecks.io theo dõi `https://erp.sugami.vn/health`.
- P0-08: **nộp hồ sơ** app Shopee Open Platform và TikTok Shop Partner Center (docs/ops/dang-ky-app-san.md); vẫn nên làm để sau này nối thẳng, không phụ thuộc Pancake.
- P0-11: cài Docker/Podman trên iMac, để Sugami chạy thật (P1-22).
- P3-01: tạo IAM user/key và CORS theo docs/ops/s3.md, điền `.env`, chạy `pnpm storage:check`; cho biết region, folder, có CloudFront không.
- P2-07: gửi 1–2 file Excel mẫu của đơn vị vận chuyển trung gian.

## Các giai đoạn tiếp theo

1. **Hoàn thiện P1** (kho + dữ liệu từ KiotViet): đối chiếu tồn, lịch sử import/export, nhắc việc, sức khỏe dữ liệu, chi tiết đơn, sửa/tạo sản phẩm, nhóm hàng và thương hiệu, nhập/xuất Excel sản phẩm. Kết thúc bằng P1-22: chạy thật trên iMac 1 tuần.
2. **P4 (Pancake rồi sàn trực tiếp):** P4-P2 tự kéo đơn, P4-P3 đẩy tồn; sau đó TikTok Shop và Shopee trực tiếp khi app được duyệt (P4-02..12), báo cáo lãi gộp theo SKU/kênh/tháng.
3. **P2 (nguồn hàng Taobao/1688):** nhà cung cấp, đơn vị trung gian, PO, kiện hàng, import Excel trung gian, landed cost, nhận hàng, kiểm kho trên điện thoại, công nợ, in tem.
4. **P3 (media và content):** thư viện ảnh, xử lý ảnh, content theo kênh, gói ảnh theo chuẩn sàn.
5. **P5 (thay KiotViet):** xử lý đơn trong Sugami, đổi trả, đơn thủ công, đẩy tồn trực tiếp, 30 ngày chạy không KiotViet.

## Quyết định đã chốt

- 2026-11-23: Đơn **hoàn hàng** từ sàn: khi Pancake báo hàng đã về shop, Sugami **tự cộng lại tồn** (giống sàn) và tính là đã xử lý; nếu hàng lỗi/mất thì bấm *Báo hàng lỗi/mất* trong đơn để trừ ra (phiếu `damage`). Đơn hoàn cũ còn giữ tồn vẫn "chờ xử lý": *Nhập lại kho* hoặc *Không nhập kho*. Menu chỉ đếm đơn hoàn chưa xử lý.
- 2026-11-23: Giao diện **kính sáng** (D16): bố cục kiểu Gmail, góc vuông, khối kính trong mờ viền sáng, số liệu font mono; menu trái chia nhóm Đơn hàng / Kho / Nền tảng; icon sàn hình thoi có logo. Màu nhấn mặc định **xanh ngọc**, đổi được trong Cài đặt → Giao diện (xanh ngọc / xanh da trời / tím pastel, kính sáng / kính tối), lưu theo từng máy.
- 2026-11-22: P4-P2 làm **Shopee VN + TikTok trước**, Shopee MY/PH để sau; chỉ bật tự đẩy tồn (P4-P3) sau khi Sugami đã tự nhận đơn từ Pancake (nếu không sẽ ghi đè tồn cũ lên tồn Pancake đã trừ đơn mới).
- 2026-11-22: Sugami **có quản lý khách hàng** (D15): trang Khách hàng, nối với đơn qua mã khách KiotViet; lưu thông tin như file KiotViet xuất (phần lớn đã bị che), không lưu `Ghi chú`. Thay quyết định "chỉ lưu mã khách" bên dưới.
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
- 2026-11-22: Mỗi tài khoản sàn trong Pancake là một kênh riêng trong Sugami, dùng đúng "tên gợi nhớ" đặt trong Pancake (SuGaMi Shopee, SuGaMi Shopee MY, SuGaMi Shopee PH, SuGaMi Tiktok); phân biệt theo ID tài khoản vì 3 shop Shopee cùng `marketplace_id` -3; TikTok tạm là -9 (docs/pancake.md).
- 2026-11-22: Chủ shop chọn **dùng thử Pancake POS 15 ngày** (200k/tháng, đối tác TikTok) làm lớp trung gian thay KiotViet (D11, docs/pancake.md). Trong lúc thử, KiotViet vẫn là bên duy nhất đẩy tồn.
- 2026-11-22: Chủ shop yêu cầu: đồng bộ/webhook phải chịu được iMac tắt hoặc dịch vụ chết (thiết kế ở docs/03 mục 3.8: quét bù theo con trỏ, chỉ đẩy tồn khi đã kéo hết đơn bị lỡ, giám sát từ bên ngoài); web là PWA có thông báo đẩy cho chủ shop.

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
| 2026-11-22 | P1-18/P1-20 trang Tồn kho và Tổng quan với số liệu thật | 8ee9509 |
| 2026-11-22 | P1-23 PWA + thông báo đẩy; thiết kế chịu máy tắt (docs/03 mục 3.8) | 7beb1dd |
| 2026-11-22 | P1-13 phiếu nhập/kiểm kho trên Sugami + xuất file mẫu KiotViet (phiếu nhập, kiểm kho, sản phẩm mới) | fa4e006 |
| 2026-11-22 | P4-P1 nối Pancake POS (chỉ đọc): client, ánh xạ sản phẩm/đơn, webhook vào `webhook_events`, `probe` | 43fbac4 |
| 2026-11-22 | P4-P1 chạy `probe` thật: 4 kênh (Shopee VN/MY/PH, TikTok -9), lệnh ngắn `pnpm pancake:probe`, ghi tài khoản vào docs/pancake.md | 574e537 |
| 2026-11-22 | Nâng giới hạn turbo để `pnpm dev` chạy với 11 tiến trình | 348f8e9 |
| 2026-11-22 | Format Prettier để CI xanh lại | 79f4778 |
| 2026-11-22 | P1-24 trang Khách hàng, import file khách KiotViet, liên kết khách với đơn | xem commit `[P1-24]` |
| 2026-11-22 | P4-P1b nút đẩy sản phẩm và tồn sang Pancake (từng sản phẩm, xem trước) | xem commit `[P4-P1b]` |
| 2026-11-22 | Thử 1 SKU qua Pancake đạt: tồn đổi từ Sugami lên tới Shopee. Bước tiếp: P4-P3 tự đẩy tồn | – |
| 2026-11-22 | Tin đăng sàn: bảng channel_listings (+biến thể, nối với biến thể Sugami), mục "Tin đăng sàn", drawer, thẻ trong chi tiết sản phẩm | xem commit `[P4]` |
| 2026-11-22 | UI: kéo chuột cuộn ngang bảng, viền cột ghim khi che; bỏ cột ghi chú đơn; sản phẩm mở dạng drawer, hiện biến thể/giá/tồn theo kho/ảnh (URL từ file KiotViet); nhập file khách không ghi đè tên thật bằng tên bị che | xem commit `[UI]` |
| 2026-11-22 | UI: trang danh sách full-width; chi tiết đơn/khách mở dạng drawer theo URL (`?d=order:MÃ`), giữ nguyên tìm kiếm/trang khi quay lại, Quay lại trong drawer về đúng đơn/khách trước | xem commit `[UI]` |
| 2026-11-22 | P4-P2: tên khách lấy từ `customer.username` (nickname Shopee); lưu hạn bàn giao, địa chỉ nhận, phí sàn + chi tiết vào đơn, hiện ở danh sách/chi tiết đơn, bổ sung cho đơn KiotViet cũ; đếm dòng hàng chưa liên kết | xem commit `[P4-P2]` |
| 2026-11-22 | P4-P2 worker tự kéo đơn Pancake (Shopee VN + TikTok), trừ/hoàn tồn, chống trùng với đơn KiotViet, báo đơn mới | xem commit `[P4-P2]` |
| 2026-11-22 | [P4] Ghép tay dòng hàng Pancake chưa liên kết vào mã hàng Sugami có sẵn (trang Dữ liệu Pancake) | main |
| 2026-11-22 | [P6] Trang Bán hàng tại quầy: nhiều đơn nháp, bán thường/giao hàng, trừ tồn, mẫu biên lai và in bill, đổi trạng thái tay | main |
| 2026-11-22 | [P6] Bán hàng: ảnh sản phẩm, chọn ngày giờ, thẻ khách + popup, ngăn xác nhận + popup thành công, khung cố định, ngăn đơn gần đây | main |
| 2026-11-23 | [UI] Giao diện kính sáng: bộ màu theo biến CSS, menu nhóm Đơn hàng/Kho/Nền tảng, icon sàn hình thoi, thẻ/nút/bảng/nhãn/KPI mới, chọn tông màu trong Cài đặt | xem commit `[UI]` |
| 2026-11-23 | [UI] Trang Đơn hàng kiểu Gmail (thanh công cụ, nút lọc thả xuống, tab kênh, đơn cần xử lý in đậm), số đếm trên menu; đơn hoàn có bước "đã xử lý" (nhập lại kho / không nhập) | xem commit `[UI]` |
| 2026-11-23 | Đơn hoàn từ sàn tự cộng lại tồn khi hàng về shop; nút Báo hàng lỗi/mất trong đơn; bỏ nút Tạo đơn ở menu | xem commit `[P4-P2]` |

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
| P1-13 | Export Excel phiếu nhập/kiểm kho theo mẫu import KiotViet | 🟡 | fa4e006 | Code xong; chờ chủ shop import thử vào KiotViet |
| P1-14 | Schema kho: warehouse, stock_level, stock_movement | ✅ | aaf6f99 | |
| P1-15 | Đối chiếu tồn file KiotViet ↔ sổ kho Sugami | ⬜ | | |
| P1-16 | Trung tâm dữ liệu: lịch sử import/export | ⬜ | | |
| P1-17 | Nhắc việc đồng bộ Excel trên dashboard | ⬜ | | |
| P1-18 | Danh sách tồn kho (ma trận SKU × kho, tô màu mức tồn) | ✅ | 8ee9509 | |
| P1-19 | Danh sách đơn hàng, chi tiết đơn, lọc theo kênh | ✅ | | Danh sách, lọc, trang chi tiết (sản phẩm, giá trị, thanh toán, khách, vận chuyển, lãi gộp ước tính). Địa chỉ nhận, hạn bàn giao, phí sàn chờ lấy từ Pancake / đối soát |
| P1-20 | Dashboard cơ bản | ✅ | 8ee9509 | Doanh thu hôm nay/7 ngày, lãi gộp 30 ngày, giá trị tồn, việc cần làm |
| P1-21 | Báo cáo sức khỏe dữ liệu: SKU trùng/thiếu, thiếu ảnh, tồn âm | ⬜ | | |
| P1-22 | Deploy production lên iMac, dùng thật 1 tuần | 👤 ⬜ | | |
| P1-23 | PWA cài lên điện thoại + thông báo đẩy (đăng ký thiết bị, API gửi, nút bật/tắt) | ✅ | 7beb1dd | Chủ shop yêu cầu 2026-11-22; thông báo thật thêm ở P4-P2, P1-17 |
| P1-24 | Quản lý khách hàng: import Excel khách KiotViet, trang danh sách/chi tiết/sửa, nối khách với đơn | 🟡 | | Code xong, lint/typecheck/build qua; test MySQL chưa chạy; chờ chủ shop nhập file khách thật |

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
| P4-P1 | Pancake: client API, đọc sản phẩm/tồn/đơn, nhận webhook vào `webhook_events`, lệnh `probe` | ✅ | 43fbac4, 574e537 | Đã chạy `probe` trên shop thật (22/11): 4 kênh, 625 listing chưa liên kết, chưa có sản phẩm/đơn |
| P4-P1b | Pancake: nút đẩy 1 sản phẩm (tạo sản phẩm, đồng bộ tồn) từ trang chi tiết sản phẩm, xem trước rồi mới ghi | ✅ | 04cc03d | Thử 1 SKU thật 22/11: tạo trên Pancake, liên kết Shopee, đổi tồn từ Sugami đã lên Shopee. Còn ghi lại độ trễ (docs/pancake.md) |
| P4-P2 | Pancake: tự kéo đơn (quét bù theo con trỏ khi khởi động, mỗi 5 phút; webhook tùy chọn), trừ tồn theo đơn, thông báo đơn mới | 🟡 | | Phạm vi chủ shop chốt 22/11: Shopee VN + TikTok trước, MY/PH sau. Code xong, test MySQL chờ CI; chưa chạy trên đơn thật (docs/pancake.md) |
| P4-P3 | Pancake: đẩy tồn từ Sugami (outbox, chỉ đẩy khi quét bù đơn còn mới), tắt đồng bộ tồn KiotViet | ⬜ | | Sau khi thử 1 SKU đạt |
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
| 2026-11-23 | P4/P6: trang Sản phẩm gom kho + liên kết Pancake/Shopee/TikTok (nhãn đã nối/tổng biến thể, drawer tin đăng, xác nhận tay tin Pancake không nói rõ sản phẩm), tự nối dòng đơn chưa có SKU qua tin đăng đã nối, hạn bàn giao đơn POS, đổi thứ tự menu, lịch sử hiện tên biến thể | main |
| 2026-11-23 | P1-21: thẻ "Sức khỏe shop" trên Tổng quan (đơn Pancake cập nhật, tồn âm, dòng đơn chưa nối, tin đăng chưa nối, biến thể chưa có trên Pancake, tự đẩy tồn, thiếu giá vốn/ảnh), mỗi dòng bấm tới chỗ sửa | main |
| 2026-11-23 | P1-09: tạo sản phẩm (trang /products/new: thuộc tính, ma trận biến thể, mã SP tự tăng), sửa sản phẩm/biến thể ngay trên trang chi tiết, thêm biến thể; API `POST /products`, `PATCH /products/:code`, `PATCH /variants/:sku`, `POST /products/:code/variants` (test MySQL viết nhưng chưa chạy) | main |
| 2026-11-23 | P2 (bản gọn): nhà cung cấp + đơn nhập hàng (`/purchasing`): giá VND hoặc CNY (tỷ giá), chi phí khác chia vào giá vốn theo giá trị hàng, đặt hàng → nhận hàng sinh phiếu nhập và cộng tồn + giá vốn bình quân; bảng `suppliers`, `purchase_orders`, `purchase_order_lines`, `purchase_order_costs` (cần `pnpm db:deploy`). Chưa có: kiện hàng/mã vận đơn, nhận một phần, công nợ, import Excel trung gian (test MySQL viết nhưng chưa chạy) | main |
| 2026-11-23 | P4-12 (bản đầu): báo cáo lãi gộp `/reports` theo tháng/kênh/sản phẩm/SKU, lọc 30 ngày/3 tháng/năm; lãi = tiền hàng − giá vốn trên dòng đơn (thiếu thì lấy giá vốn hiện tại, đánh dấu *), trừ phí sàn theo tháng/kênh; API `GET /reports/profit` (SQL chưa chạy trên DB thật) | main |
| 2026-11-23 | Thông báo: chuông ở header có nhật ký (đơn mới, đơn đổi trạng thái/hủy/hoàn/đổi sản phẩm từ Pancake, lỗi đồng bộ/đẩy tồn), số chưa đọc; hủy/hoàn/đổi sản phẩm/lỗi và đơn mới còn gửi push PWA; ghi log worker; bảng `notifications` (cần `pnpm db:deploy`); sửa ngày mua gần nhất của khách từ đơn | main |
| 2026-11-23 | P3-06 (bước đầu): thẻ "Nội dung" trên trang sản phẩm, soạn nội dung gốc + bản riêng Shopee/TikTok (bộ đếm tiêu đề 120/255), bảng `product_contents` (cần `pnpm db:deploy`); chưa đẩy lên sàn, chưa có duyệt/phiên bản | main |
| 2026-11-23 | Đơn hàng: ô chọn đầu dòng + chọn tất cả, nút "Hoàn tất đơn" hàng loạt (`POST /orders/bulk/complete`): đơn tại quầy chưa trừ tồn thì trừ tồn, ghi đã thu đủ; đơn KiotViet chỉ đổi trạng thái; bỏ qua đơn sàn (theo trạng thái sàn) và đơn đã hủy/hoàn | main |
