# 7. Lộ trình

Bối cảnh đã xác nhận: vài trăm SKU, dưới 10 đơn/ngày, ngành đồ chơi, nhập từ Taobao/1688 qua đơn vị vận chuyển trung gian, và **mục tiêu dài hạn là thay KiotViet** khi đã có API trực tiếp của sàn.

Vì quy mô nhỏ, lộ trình ưu tiên **giá trị dùng ngay** (nguồn hàng, giá vốn thật, ảnh/content) và **sẵn sàng thoát KiotViet** ngay từ thiết kế: Sugami tự giữ sổ kho đầy đủ từ ngày đầu, KiotViet chỉ là một "kênh" có thể gỡ ra.

Claude viết toàn bộ code, commit thẳng lên `main`. Thời lượng dưới đây là ước lượng theo lịch, phụ thuộc nhiều vào các task 👤. Danh sách task chi tiết ở [09](09-ke-hoach-trien-khai.md), tiến độ ở [`PROGRESS.md`](../PROGRESS.md).

| GĐ | Tên | Thời lượng | Kết quả chính |
|----|-----|-----------|---------------|
| 0 | Chuẩn bị & xác minh | 1–2 tuần | Xác minh KiotViet API, đăng ký app Shopee/TikTok, prototype UI, khung dự án |
| 1 | Nền tảng + catalog + kết nối KiotViet | 3–4 tuần | Đăng nhập, sản phẩm/biến thể, import & đồng bộ từ KiotViet, tồn, đơn |
| 2 | Nguồn hàng Taobao/1688 + kho | 3–4 tuần | Đơn đặt hàng TQ, kiện hàng qua trung gian, landed cost, nhập kho, kiểm kho |
| 3 | Media & content | 2–3 tuần | Thư viện ảnh, preset ảnh sàn, content theo kênh |
| 4 | Kết nối sàn trực tiếp (TikTok Shop, Shopee) | 4–6 tuần | Đọc đơn, đẩy tồn, đẩy listing/ảnh, lấy phí sàn trực tiếp |
| 5 | Thay KiotViet | 2–3 tuần | Sugami là master tồn & đơn, tắt liên kết sàn của KiotViet, hủy gói |
| 6 | Mở rộng | liên tục | Facebook/Zalo, website, báo cáo nâng cao, AI |

## GĐ0 — Chuẩn bị & xác minh (tuần 1–2)

- [ ] Lấy client_id/secret KiotViet, viết script gọi thử `/branches`, `/products?includeInventory=true`, `/orders`, `/invoices`, `/purchaseorders`, `/webhooks`; lưu payload mẫu vào `docs/kiotviet-samples/`.
- [ ] Xác minh đơn Shopee/TikTok trong KiotViet có mã đơn sàn, kênh bán, phí không.
- [ ] **Đăng ký sớm** app trên **Shopee Open Platform** và **TikTok Shop Partner Center** (loại app cho hệ thống nội bộ của người bán). Việc duyệt có thể mất vài tuần nên làm ngay từ đầu. Kiểm tra điều kiện đăng ký với shop cá nhân/hộ kinh doanh **(cần xác minh)**.
- [ ] Rà soát SKU KiotViet ↔ Shopee ↔ TikTok, chuẩn hóa quy tắc đặt mã.
- [ ] Prototype 5 màn hình, chủ shop duyệt.
- [ ] Khởi tạo monorepo, CI, Docker Compose (Redis; MySQL native).
- [ ] Chuẩn bị iMac làm server: cài Docker, tắt ngủ, UPS, tên miền + Cloudflare Tunnel, lịch sao lưu ra ngoài.

**Hoàn thành khi:** có báo cáo xác minh API, hồ sơ app sàn đã nộp, prototype đã duyệt.

## GĐ1 — Nền tảng + catalog + kết nối KiotViet (tuần 3–6)

- [ ] Auth, người dùng, vai trò, audit log.
- [ ] Catalog: sản phẩm, biến thể, nhóm, thương hiệu, thuộc tính đồ chơi (độ tuổi, chất liệu, pin, chứng nhận).
- [ ] Kết nối KiotViet: token, import một lần (vài trăm SKU chỉ tốn vài request), đồng bộ tăng dần 10 phút/lần + webhook.
- [ ] **Sổ kho của Sugami chạy song song** ngay từ đầu: mọi biến động từ KiotViet ghi thành movement, để sau này chuyển master không mất lịch sử.
- [ ] Danh sách đơn, tồn kho, dashboard cơ bản.

**Hoàn thành khi:** tồn và đơn trong Sugami khớp KiotViet 100% sau 7 ngày.

## GĐ2 — Nguồn hàng Taobao/1688 + kho (tuần 7–10)

- [ ] Liên kết SKU ↔ link Taobao/1688, shop nguồn, giá CNY, lịch sử giá.
- [ ] Đơn đặt hàng TQ (PO): nhiều link trong một đợt, tỷ giá, phí mua hộ.
- [ ] **Kiện hàng qua đơn vị trung gian**: mã vận đơn nội địa TQ, mã kiện, cân nặng/khối, phí ship theo kg/m³, trạng thái (shop TQ giao → kho TQ → đang về VN → đã về).
- [ ] Phân bổ landed cost (giá hàng + ship nội địa TQ + phí trung gian + ship VN) → giá vốn VND thật cho từng SKU.
- [ ] Nhận hàng: quét mã, đếm, ghi hàng lỗi/thiếu (chụp ảnh để khiếu nại), xác nhận → phiếu nhập đẩy sang KiotViet.
- [ ] Kiểm kho trên điện thoại, thẻ kho, báo cáo xuất nhập tồn.
- [ ] Cảnh báo sắp hết + đề xuất đặt hàng theo tốc độ bán và thời gian hàng về (thường 7–20 ngày).

**Hoàn thành khi:** một đợt hàng thật từ 1688 đi hết luồng và giá vốn từng SKU khớp tính tay.

## GĐ3 — Media & content (tuần 11–13)

- [ ] Thư viện ảnh/video, tự gán SKU theo tên file, tải ảnh gốc từ link Taobao/1688 về làm tư liệu.
- [ ] Preset ảnh vuông 1:1 cho Shopee/TikTok, watermark, tải gói ảnh.
- [ ] Content theo kênh: tiêu đề, mô tả, cảnh báo an toàn đồ chơi theo độ tuổi; trợ lý AI dịch/viết lại mô tả từ trang Taobao (tùy chọn).

**Hoàn thành khi:** mọi SKU đang bán có đủ ảnh chuẩn và mô tả theo từng sàn.

## GĐ4 — Kết nối sàn trực tiếp (tuần 14–19)

Phụ thuộc: app Shopee/TikTok đã được duyệt ở GĐ0.

- [ ] Adapter **TikTok Shop**: OAuth shop, sản phẩm, đơn, phí/đối soát, webhook, đẩy listing + ảnh.
- [ ] Adapter **Shopee Open Platform**: OAuth shop, sản phẩm, đơn, phí/đối soát, push, đẩy listing + ảnh.
- [ ] Chế độ **"chỉ đọc"** trước: Sugami đọc đơn từ sàn song song với KiotViet 2 tuần, so khớp.
- [ ] Đối soát lãi thật theo đơn (doanh thu − phí sàn − giá vốn).

**Hoàn thành khi:** đơn đọc trực tiếp từ sàn khớp 100% với KiotViet trong 2 tuần, tạo được listing mới từ Sugami.

## GĐ5 — Thay KiotViet (tuần 20–22)

- [ ] Xử lý đơn hoàn toàn trong Sugami: xác nhận, đóng gói (quét đối chiếu), in phiếu, đổi trả.
- [ ] Bật Sugami đẩy tồn trực tiếp lên Shopee/TikTok; **cùng lúc** tắt đồng bộ tồn của KiotViet (tránh hai nguồn ghi).
- [ ] Chạy song song 1–2 tuần, có nút quay lại KiotViet nếu lệch.
- [ ] Xuất toàn bộ dữ liệu KiotViet lưu trữ (sản phẩm, khách, hóa đơn, phiếu nhập) trước khi hủy gói.
- [ ] Bán tại chỗ/khách quen: tạo đơn thủ công trong Sugami (không cần POS đầy đủ vì đơn ít).

**Hoàn thành khi:** 30 ngày vận hành không dùng KiotViet, không bán âm.

## GĐ6 — Mở rộng

- Đơn Facebook/Zalo, website riêng dùng catalog Sugami.
- Báo cáo nâng cao: lãi theo SKU/kênh, tuổi tồn, hiệu quả nguồn hàng.
- Thông báo Telegram/Zalo.

## Mốc kiểm soát

| Mốc | Tuần | Chủ shop cần làm |
|-----|------|------------------|
| M0 | 2 | Duyệt prototype, cung cấp API KiotViet, nộp hồ sơ app Shopee/TikTok |
| M1 | 6 | Dùng thử 1 tuần, báo sai lệch |
| M2 | 10 | Chạy một đợt hàng 1688 thật qua Sugami |
| M3 | 13 | Duyệt ảnh/content |
| M4 | 19 | Xác nhận đơn từ sàn khớp |
| M5 | 22 | Quyết định hủy gói KiotViet |
