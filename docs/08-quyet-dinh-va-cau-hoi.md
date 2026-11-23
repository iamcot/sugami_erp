# 8. Quyết định & câu hỏi mở

## 8.1 Thông tin chủ shop đã xác nhận (22/11/2026)

| Câu hỏi | Trả lời | Ảnh hưởng tới kế hoạch |
|---------|---------|------------------------|
| Quy mô | Vài trăm SKU, dưới 10 đơn/ngày | Hạn mức API KiotViet không còn là rủi ro; chạy trên iMac của shop là đủ; bỏ pick list gom đơn, kanban đơn phức tạp |
| Gói KiotViet | Gói Chuyên nghiệp, đã liên kết sàn, **không có Public API** (chỉ gói Cao cấp) | Trao đổi dữ liệu bằng Excel; kết nối thẳng Shopee/TikTok sớm |
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
| D7 | TypeScript monorepo: Next.js + NestJS + **MySQL 8 native** + Redis/BullMQ + ảnh trên AWS S3 có sẵn, chạy bằng **Docker trên iMac** của shop, ra internet qua Cloudflare Tunnel | Chủ shop chọn; không tốn tiền server; chuyển lên VPS sau dễ |
| D8 | Web app + PWA cho kho, chưa làm app native | Đủ cho quy mô hiện tại |
| D9 | Không nâng gói KiotViet. Trao đổi với KiotViet bằng **file Excel** cho tới khi kết nối thẳng Shopee/TikTok; nộp hồ sơ app sàn ngay (chủ shop chọn 22/11/2026) | Không tăng chi phí; đơn ít nên thao tác tay vài phút/tuần |
| D10 | Giữ nguyên **mã hàng KiotViet làm SKU** (kể cả mã không theo mẫu `SP…`); sản phẩm = nhóm mã theo cột `Mã HH Liên quan` | Đơn và tồn hai bên khớp nhau theo mã, không phải đổi mã trên sàn |
| D11 | **Dùng thử Pancake POS** (200k/tháng, thử 15 ngày, đối tác TikTok) làm lớp trung gian thay KiotViet: Sugami nối Pancake qua Open API + webhook; trong lúc thử KiotViet vẫn là bên duy nhất đẩy tồn | Bỏ xuất/nhập Excel bằng tay; không phải chờ Shopee/TikTok duyệt app |
| D12 | Đồng bộ phải **chịu được iMac tắt/dịch vụ chết**: webhook chỉ là tín hiệu, nguồn chính là quét bù theo con trỏ; chỉ đẩy tồn khi đã kéo hết đơn bị lỡ (docs/03 mục 3.8) | Máy ở nhà có thể tắt; Pancake chỉ gửi lại webhook 2 lần |
| D13 | Web là **PWA** cài lên điện thoại, có **thông báo đẩy** cho chủ shop (Web Push/VAPID) | Không cần làm app riêng; iPhone cần iOS 16.4+ và mở từ màn hình chính |
| D14 | Mỗi tài khoản sàn trong Pancake là một **kênh riêng** trong Sugami, tên theo "tên gợi nhớ" trong Pancake; phân biệt theo ID tài khoản, tiền tệ lưu riêng cho MY/PH | 3 shop Shopee cùng `marketplace_id` -3; đơn MY/PH không tính bằng VND |
| D15 | Sugami **có quản lý khách hàng**: trang Khách hàng, nối với đơn qua mã khách KiotViet. Lưu thông tin khách đúng như file KiotViet xuất (phần lớn đã bị che), không lưu `Ghi chú`. Thay quyết định cũ "chỉ lưu mã khách" | Chủ shop yêu cầu 22/11/2026 và gửi file mẫu |
| D16 | Giao diện **kính sáng**: bố cục kiểu Gmail, góc vuông, khối kính trong mờ, số liệu font mono, menu nhóm Đơn hàng / Kho / Nền tảng. Màu nhấn chọn trong Cài đặt (mặc định xanh ngọc), có bản kính tối | Chủ shop chốt 23/11/2026 sau khi xem bản mẫu; người dùng chính là nhân viên nữ nên mặc định nền sáng |
| D17 | Chat Shopee đọc từ Pancake **Pages API** bằng page access token, **polling theo yêu cầu** (cache 20 giây), không bật webhook | Webhook tính 2 trang trong gói cước (Standard chỉ 3 trang); shop dưới 10 đơn/ngày không cần tức thì. Dài hạn thay bằng Shopee/TikTok trực tiếp |

## 8.3 Câu hỏi còn mở

0. **Pancake POS**: còn cần kiểm chứng các mục trong [pancake.md](pancake.md#chưa-kiểm-chứng-cần-dữ-liệu-thật) trong 15 ngày dùng thử, và chủ shop cho biết shop Shopee MY/PH có cần quản lý trong Sugami không.
1. Đơn vị trung gian **chỉ có file Excel** (đã xác nhận). Còn cần: họ tính phí theo kg, theo m³, hay lấy số lớn hơn? Có phí mua hộ (% giá trị) không? Gửi 1–2 file mẫu cho task P2-07.
2. Bạn đặt hàng trực tiếp trên Taobao/1688 rồi gửi về kho trung gian, hay đưa link để họ mua hộ?
3. Ngoài Shopee và TikTok Shop, hiện có bán qua Facebook/Zalo hay cửa hàng không?
4. Shop đăng ký dạng hộ kinh doanh hay công ty? (Ảnh hưởng điều kiện đăng ký app Shopee Open Platform/TikTok Partner.)
5. Tên miền **sugami.vn**; ERP dùng `erp.sugami.vn`, webhook dùng `hooks.sugami.vn` (đã xác nhận). Còn cần: iMac là Intel hay Apple Silicon, RAM bao nhiêu?
6. Claude viết toàn bộ code, commit thẳng lên `main`; theo dõi tiến độ ở `PROGRESS.md` (đã xác nhận).

**Vận chuyển đơn tự giao (23/11/2026, chủ shop xác nhận):** dùng Allingo (đã loại Nhanh.vn; Pancake không có API vận chuyển); khoảng 20 đơn/tháng; giao thường SPX, giao nhanh bên rẻ nhất (thường AhaMove); phí ship mặc định khách trả, có ô cộng phí vào đơn thì shop trả; không mua bảo hiểm; ba cỡ hộp theo cân (≤ 500 g, ≤ 3 kg, > 3 kg); điểm lấy hàng nhập trong app. Chi tiết: [allingo.md](allingo.md).

## 8.4 Việc cần xác minh kỹ thuật (GĐ0)

- KiotViet: tên sự kiện webhook Retail, header chữ ký, cách băm body; đơn sàn là order hay invoice, có mã đơn sàn/phí không; tạo phiếu nhập qua API có tự đẩy tồn lên sàn không.
- Shopee Open Platform và TikTok Shop Partner: loại app cho hệ thống nội bộ người bán, điều kiện, thời gian duyệt, giới hạn API.
