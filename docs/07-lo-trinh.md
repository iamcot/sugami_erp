# 7. Lộ trình

Ước lượng cho 1–2 lập trình viên full-stack. Mỗi giai đoạn kết thúc bằng một bản chạy được mà shop dùng thật.

| GĐ | Tên | Thời lượng | Kết quả chính |
|----|-----|-----------|---------------|
| 0 | Chuẩn bị & xác minh | 2 tuần | Xác minh API trên store thật, prototype UI, khung dự án |
| 1 | Nền tảng + đọc KiotViet | 4–5 tuần | Đăng nhập, phân quyền, import & đồng bộ sản phẩm/tồn/đơn, dashboard cơ bản |
| 2 | Kho, nguồn hàng, media | 5–6 tuần | Phiếu kho, kiểm kho mobile, NCC & PO, landed cost, thư viện ảnh |
| 3 | Đơn hàng, content, báo cáo | 5–6 tuần | Quy trình xử lý đơn, đối soát sàn, content theo kênh, báo cáo lãi |
| 4 | TikTok Shop trực tiếp | 4–5 tuần | Adapter TikTok Shop: listing, tồn, đơn, đẩy content |
| 5 | Mở rộng | liên tục | Shopee Open Platform trực tiếp, Lazada, website, Facebook/Zalo, AI |

## GĐ0 — Chuẩn bị & xác minh (tuần 1–2)

- [ ] Lấy client_id/secret của store KiotViet thật (hoặc store thử nghiệm).
- [ ] Viết script kiểm tra: token, `/branches`, `/products?includeInventory=true`, `/orders`, `/invoices`, `/purchaseorders`, `/webhooks`; ghi lại payload mẫu vào `docs/kiotviet-samples/`.
- [ ] Xác minh: đơn Shopee hiện ra là order hay invoice, có `saleChannelId`/mã đơn sàn không; tên sự kiện webhook Retail và cách ký; giới hạn ghi.
- [ ] Rà soát SKU hiện tại: KiotViet ↔ Shopee có khớp không, bao nhiêu SKU, bao nhiêu biến thể.
- [ ] Prototype 5 màn hình, chủ shop duyệt.
- [ ] Khởi tạo monorepo, CI (lint, typecheck, test), Docker Compose (Postgres, Redis, MinIO), môi trường staging.

**Hoàn thành khi:** có báo cáo xác minh API và prototype đã duyệt.

## GĐ1 — Nền tảng + đọc KiotViet (tuần 3–7)

- [ ] Auth, người dùng, vai trò, audit log.
- [ ] Module kết nối KiotViet: lưu secret mã hóa, token cache, rate limiter, client có retry.
- [ ] Import ban đầu: nhóm hàng, sản phẩm/biến thể, chi nhánh → kho, tồn kho, NCC, khách, đơn 90 ngày.
- [ ] Đồng bộ tăng dần + webhook receiver + reconcile đêm; trung tâm đồng bộ.
- [ ] Màn hình: danh sách & chi tiết sản phẩm (chỉ đọc trường do KiotViet quản), tồn kho theo kho, danh sách đơn, dashboard cơ bản.
- [ ] Báo cáo sức khỏe dữ liệu (SKU trùng/thiếu, thiếu ảnh).

**Hoàn thành khi:** dữ liệu Sugami khớp KiotViet ≥ 99,9% SKU sau 7 ngày chạy, độ trễ < 10 phút.

## GĐ2 — Kho, nguồn hàng, media (tuần 8–13)

- [ ] Sổ kho, thẻ kho, báo cáo xuất nhập tồn.
- [ ] Phiếu nhập/xuất/chuyển/điều chỉnh → đẩy sang KiotViet qua outbox.
- [ ] Kiểm kho trên điện thoại (PWA, quét camera, offline).
- [ ] NCC, liên kết SKU–NCC, báo giá, PO, nhận hàng, landed cost, công nợ.
- [ ] Giá vốn bình quân theo landed cost.
- [ ] Thư viện media: upload hàng loạt, tự gán SKU, preset ảnh sàn, watermark, tải gói ảnh.
- [ ] Cảnh báo hết hàng + đề xuất đặt hàng.

**Hoàn thành khi:** nhận một PO thật từ NCC → tồn KiotViet và Shopee cập nhật đúng; kiểm kho một kho thật trên điện thoại.

## GĐ3 — Đơn hàng, content, báo cáo (tuần 14–19)

- [ ] Quy trình đơn: xác nhận → soạn → đóng gói (quét đối chiếu) → bàn giao; pick list, in phiếu.
- [ ] Đổi trả, nhập lại kho.
- [ ] Đơn thủ công (Facebook/Zalo) → đẩy KiotViet.
- [ ] Nhập file đối soát Shopee/TikTok (phí sàn, tiền thực nhận).
- [ ] Content theo kênh: template, bộ đếm ký tự, duyệt, phiên bản; trợ lý AI viết nháp (tùy chọn).
- [ ] Lịch content.
- [ ] Báo cáo lãi gộp theo SKU/kênh, tuổi tồn, ABC, hiệu quả NCC.
- [ ] Thông báo Telegram/Zalo.

**Hoàn thành khi:** chủ shop xem được lãi gộp thật theo kênh của tháng trước.

## GĐ4 — TikTok Shop trực tiếp (tuần 20–24)

Lý do kết nối trực tiếp dù KiotViet đã liên kết TikTok: để **đẩy content/ảnh/listing** và lấy **phí sàn, trạng thái vận chuyển** mà KiotViet Public API không cung cấp.

- [ ] Đăng ký app TikTok Shop Partner Center, OAuth shop, lưu token, làm mới token.
- [ ] Đọc sản phẩm, đơn, phí, đối soát; webhook TikTok.
- [ ] Tạo/sửa listing từ content Sugami (tiêu đề, mô tả, ảnh, thuộc tính ngành hàng).
- [ ] Quyết định nguồn đẩy tồn: giữ KiotViet đẩy tồn (khuyến nghị, tránh 2 nguồn ghi) hoặc Sugami đẩy trực tiếp.

**Hoàn thành khi:** tạo một listing TikTok mới hoàn toàn từ Sugami.

## GĐ5 — Mở rộng

- Shopee Open Platform trực tiếp (listing, ảnh, phí, quảng cáo).
- Lazada, website riêng (headless, dùng catalog Sugami), Facebook/Zalo shop.
- Dự báo nhu cầu, gợi ý giá, phân tích đối thủ.
- Cân nhắc chuyển Sugami thành master tồn kho nếu KiotViet trở thành nút thắt.

## Mốc kiểm soát

| Mốc | Tuần | Chủ shop cần làm |
|-----|------|------------------|
| M0 | 2 | Duyệt prototype, cung cấp API KiotViet |
| M1 | 7 | Dùng thử bản xem dữ liệu 1 tuần, báo sai lệch |
| M2 | 13 | Nhận PO thật, kiểm kho thật |
| M3 | 19 | Xem báo cáo lãi tháng, duyệt quy trình đơn |
| M4 | 24 | Tạo listing TikTok từ Sugami |
