# 8. Quyết định & câu hỏi mở

## 8.1 Thông tin chủ shop đã xác nhận (22/11/2026)

| Câu hỏi | Trả lời | Ảnh hưởng tới kế hoạch |
|---------|---------|------------------------|
| Quy mô | Vài trăm SKU, dưới 10 đơn/ngày | Hạn mức API KiotViet không còn là rủi ro; chạy trên iMac của shop là đủ; bỏ pick list gom đơn, kanban đơn phức tạp |
| Gói KiotViet | Đã có API và đã kết nối sàn | Làm được GĐ1 ngay |
| Ngành hàng | Đồ chơi | Thuộc tính: độ tuổi, chất liệu, pin, kích thước, chứng nhận/CR (hợp quy); cảnh báo an toàn trong content; không cần lô/hạn dùng |
| Nguồn hàng | Taobao/1688 qua đơn vị vận chuyển trung gian | Module sourcing là trọng tâm: CNY, tỷ giá, kiện hàng, phí theo kg/m³, landed cost |
| Server | iMac bật cả ngày, Docker, MySQL | Docker Compose trên iMac, MySQL 8 thay PostgreSQL, Cloudflare Tunnel cho webhook, sao lưu ra ngoài |
| Dài hạn | Thay KiotViet khi có API sàn (chi phí app tăng) | Sugami giữ sổ kho đầy đủ từ đầu; thêm GĐ5 "Thay KiotViet"; đăng ký app sàn ngay GĐ0 |

## 8.2 Quyết định

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | Giai đoạn đầu Sugami chạy **trên** KiotViet; dài hạn **thay thế** KiotViet | Ra mắt nhanh nhờ liên kết sàn sẵn có, nhưng không bị khóa vào KiotViet |
| D2 | Sugami **tự giữ sổ kho** từ ngày đầu, dù KiotViet đang là master tồn | Chuyển master không mất lịch sử, giá vốn |
| D3 | KiotViet chỉ là một adapter kênh như Shopee/TikTok | Gỡ KiotViet không đụng lõi |
| D4 | Không xây POS đầy đủ, chỉ tạo đơn thủ công | Đơn ít, chủ yếu bán online |
| D5 | **SKU = mã hàng KiotViet = SKU người bán trên sàn** | Khớp liên kết sàn hiện tại và dễ chuyển đổi sau |
| D6 | Mỗi thời điểm chỉ **một** hệ thống đẩy tồn lên sàn | Tránh bán âm; khi Sugami bật đẩy tồn thì tắt của KiotViet cùng lúc |
| D7 | TypeScript monorepo: Next.js + NestJS + **MySQL 8 native** + Redis/BullMQ + file trên ổ đĩa, chạy bằng **Docker trên iMac** của shop, ra internet qua Cloudflare Tunnel | Chủ shop chọn; không tốn tiền server; chuyển lên VPS sau dễ |
| D8 | Web app + PWA cho kho, chưa làm app native | Đủ cho quy mô hiện tại |

## 8.3 Câu hỏi còn mở

1. Đơn vị trung gian **chỉ có file Excel** (đã xác nhận). Còn cần: họ tính phí theo kg, theo m³, hay lấy số lớn hơn? Có phí mua hộ (% giá trị) không? Gửi 1–2 file mẫu cho task P2-07.
2. Bạn đặt hàng trực tiếp trên Taobao/1688 rồi gửi về kho trung gian, hay đưa link để họ mua hộ?
3. Ngoài Shopee và TikTok Shop, hiện có bán qua Facebook/Zalo hay cửa hàng không?
4. Shop đăng ký dạng hộ kinh doanh hay công ty? (Ảnh hưởng điều kiện đăng ký app Shopee Open Platform/TikTok Partner.)
5. Đã có tên miền (đã xác nhận). Còn cần: iMac là Intel hay Apple Silicon, RAM bao nhiêu?
6. Claude viết toàn bộ code, commit thẳng lên `main`; theo dõi tiến độ ở `PROGRESS.md` (đã xác nhận).

## 8.4 Việc cần xác minh kỹ thuật (GĐ0)

- KiotViet: tên sự kiện webhook Retail, header chữ ký, cách băm body; đơn sàn là order hay invoice, có mã đơn sàn/phí không; tạo phiếu nhập qua API có tự đẩy tồn lên sàn không.
- Shopee Open Platform và TikTok Shop Partner: loại app cho hệ thống nội bộ người bán, điều kiện, thời gian duyệt, giới hạn API.
