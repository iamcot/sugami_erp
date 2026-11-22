# 2. KiotViet Public API: khả năng, giới hạn, chiến lược

> Ghi chú độ tin cậy: thông tin dưới đây tổng hợp từ tài liệu Public API công khai của KiotViet, SDK cộng đồng và các tích hợp mã nguồn mở. Những mục đánh dấu **(cần xác minh)** phải được kiểm tra trên cửa hàng KiotViet thật ở Giai đoạn 0 trước khi viết code đồng bộ.

## 2.1 Xác thực

- Lấy `client_id` và `client_secret` trong KiotViet: **Thiết lập cửa hàng → Thiết lập kết nối API**.
- Lấy token: `POST https://id.kiotviet.vn/connect/token`, `Content-Type: application/x-www-form-urlencoded`, body: `grant_type=client_credentials`, `client_id`, `client_secret`, `scopes=PublicApi.Access`.
- Token dạng Bearer, `expires_in` khoảng 86400 giây (24h) theo tài liệu. Hệ thống sẽ cache token, làm mới trước khi hết hạn và retry một lần khi gặp 401.
- Mọi request: `Authorization: Bearer <token>` và header `Retailer: <tên gian hàng>`.
- Base URL: `https://public.kiotapi.com`.

## 2.2 Giới hạn

| Giới hạn | Giá trị | Ảnh hưởng thiết kế |
|---------|---------|-------------------|
| Số request GET | ~5.000 request/giờ/gian hàng | Dùng token bucket ~4.500/giờ, ưu tiên webhook, đồng bộ tăng dần theo `lastModifiedFrom` |
| Phân trang | `pageSize` tối đa 100, `currentItem` là offset | 10.000 SKU = 100 request cho lần import đầu |
| Giới hạn ghi (POST/PUT/DELETE) | Chưa rõ **(cần xác minh)** | Xếp hàng đợi ghi, retry có backoff, xử lý 429 |
| Webhook | Server phải trả 200 trong ~3 giây | Nhận webhook → lưu thô → trả 200 ngay → xử lý bất đồng bộ |

## 2.3 Tài nguyên có thể dùng

| Nhóm | Endpoint (dự kiến) | Đọc | Ghi | Dùng cho |
|------|--------------------|-----|-----|----------|
| Chi nhánh | `/branches` | ✓ | ✓ | Ánh xạ kho Sugami ↔ chi nhánh KiotViet |
| Nhóm hàng | `/categories` | ✓ | ✓ | Danh mục, cây tối đa 3 cấp |
| Hàng hóa | `/products`, `/products/{id}`, `/products/code/{code}` | ✓ | ✓ | Sản phẩm, biến thể (thuộc tính), đơn vị tính, ảnh, giá |
| Tồn kho | `includeInventory=true` trên `/products`; `/productOnHands` **(cần xác minh)** | ✓ | qua phiếu | Tồn theo chi nhánh |
| Bảng giá | `/pricebooks` **(cần xác minh)** | ✓ | ✓ | Giá theo kênh (KiotViet đẩy bảng giá lên sàn) |
| Khách hàng | `/customers`, nhóm khách | ✓ | ✓ | CRM nhẹ |
| Đặt hàng | `/orders` (lọc theo `branchIds`, `saleChannelId`) | ✓ | ✓ | Đơn chưa hoàn tất, đơn từ sàn |
| Hóa đơn | `/invoices` | ✓ | ✓ | Đơn đã bán/giao, doanh thu |
| Nhập hàng | `/purchaseorders` | ✓ | ✓ | Phiếu nhập từ NCC |
| Nhà cung cấp | `/suppliers` | ✓ | hạn chế **(cần xác minh)** | Đồng bộ NCC |
| Chuyển hàng | `/transfers` **(cần xác minh)** | ✓ | ? | Chuyển kho giữa chi nhánh |
| Trả hàng | `/returns` **(cần xác minh)** | ✓ | ? | Đổi trả |
| Kênh bán | `/salechannel` **(cần xác minh)** | ✓ | – | Phân biệt đơn Shopee/TikTok/khác |
| Sổ quỹ, tài khoản NH, thu khác | `/cashflow`, `/bankaccounts` | ✓ | hạn chế | Đối soát tiền |
| Người dùng | `/users` | ✓ | – | Gán người tạo |
| Webhook | `/webhooks` | ✓ | ✓ | Đăng ký/hủy webhook tự động khi kết nối |

Tham số chung: `pageSize`, `currentItem`, `orderBy`, `orderDirection`, `lastModifiedFrom`, `includeRemoveIds` (trả về `removeIds` để biết bản ghi đã xóa).

## 2.4 Webhook

Các sự kiện bán lẻ dự kiến **(cần xác minh tên chính xác trên Retail)**: `product.update`, `product.delete`, `stock.update`, `category.update/delete`, `customer.update/delete`, `order.update`, `invoice.update`, `pricebook.update/delete`, `pricebookdetail.update/delete`, `branch.update/delete`.

- Đăng ký qua API `/webhooks` (Type, Url, IsActive, Secret) hoặc trong màn hình thiết lập.
- Xác thực chữ ký HMAC-SHA256 bằng secret. Tài liệu và các tích hợp khác nhau ghi tên header khác nhau (`X-Hub-Signature` hay `x-signature` + `x-timestamp`) và cách băm body khác nhau. **Phải thử với một lần gửi thật** trước khi bật kiểm tra chữ ký bắt buộc.
- Webhook có thể trùng, mất hoặc đến không theo thứ tự. Vì vậy: lưu theo `requestId`/Id để chống trùng, chỉ dùng webhook như "tín hiệu có thay đổi" rồi đọc lại bản ghi qua API, và luôn có job reconcile định kỳ.

## 2.5 Liên kết sàn của KiotViet (Shopee, TikTok Shop, Lazada, Tiki)

KiotViet có sẵn tính năng kết nối sàn TMĐT trong giao diện (không phải trong Public API):

- **Liên kết hàng hóa**: tự động khớp sản phẩm sàn với hàng KiotViet theo SKU = mã hàng, hoặc sao chép sản phẩm từ sàn về KiotViet.
- **Đơn hàng**: đơn sàn tự đồng bộ về KiotViet (có thể đồng bộ thủ công 1/7/15 ngày gần nhất), ghi nhận vào "chi nhánh đồng bộ".
- **Tồn kho**: tùy chọn, có công thức tồn bán được và % tồn đẩy lên từng sàn.
- **Giá**: tùy chọn, đẩy theo một bảng giá KiotViet.

**Hệ quả quan trọng cho Sugami:**

1. Sugami **không cần gọi API Shopee** ở giai đoạn đầu. Shopee ↔ KiotViet do KiotViet lo; Sugami ↔ KiotViet qua Public API. Tồn kho Sugami thay đổi → ghi vào KiotViet (qua phiếu nhập/điều chỉnh) → KiotViet đẩy lên Shopee.
2. **Quy ước SKU là xương sống**: mã hàng KiotViet = SKU người bán trên Shopee/TikTok = SKU biến thể trong Sugami. Sugami sẽ kiểm tra và cảnh báo SKU trùng/thiếu.
3. Public API **không** cho quản lý listing trên sàn (tiêu đề, mô tả, ảnh, thuộc tính ngành hàng của Shopee). Phần content đăng sàn cần **API trực tiếp của sàn** (Shopee Open Platform, TikTok Shop Partner API) ở giai đoạn sau, hoặc tạm thời xuất file/copy thủ công.
4. Đơn sàn trong KiotViet cần xác minh: hiện là `order` hay `invoice`, có `saleChannelId` không, có mã đơn sàn không, phí sàn/phí ship có không **(cần xác minh)**. Phí sàn gần như chắc chắn không có, nên báo cáo lãi chính xác theo kênh sẽ cần API sàn hoặc nhập file đối soát của sàn.

## 2.6 Nguồn sự thật (source of truth)

| Dữ liệu | Giai đoạn 1–2 | Giai đoạn 3+ (tùy chọn) |
|---------|---------------|-------------------------|
| Mã hàng, tên, giá bán, biến thể cơ bản | KiotViet (Sugami đọc, có thể tạo mới đẩy sang) | Sugami là master, đẩy sang KiotViet |
| Ảnh, video, mô tả theo kênh, thông số, SEO | **Sugami** | Sugami, đẩy thẳng lên sàn |
| Tồn kho số lượng | **KiotViet** (Sugami mirror + sổ kho đối chiếu) | Sugami (nếu chuyển kho vật lý sang Sugami hoàn toàn) |
| Giá vốn, lô nhập, hạn dùng | Sugami tính từ phiếu nhập | Sugami |
| Nhà cung cấp, báo giá, đặt hàng NCC, công nợ | **Sugami** (đẩy phiếu nhập hoàn tất sang KiotViet) | Sugami |
| Đơn hàng | KiotViet (Sugami mirror, bổ sung trạng thái xử lý nội bộ) | Sugami nhận trực tiếp từ sàn |
| Khách hàng | KiotViet | KiotViet/Sugami |

## 2.7 Chiến lược đồng bộ

1. **Kết nối**: nhập client_id/secret/tên gian hàng → kiểm tra token → chọn chi nhánh → xem trước số SKU → import.
2. **Import ban đầu**: duyệt `/products` theo trang 100, lưu con trỏ để chạy tiếp nếu ngắt; tương tự cho nhóm hàng, chi nhánh, NCC, khách, đơn 90 ngày gần nhất.
3. **Tăng dần**: mỗi 5–10 phút gọi với `lastModifiedFrom = lần đồng bộ trước − 2 phút` cho từng tài nguyên.
4. **Webhook**: nhận → lưu `webhook_events` → trả 200 → worker đọc lại bản ghi qua API → cập nhật.
5. **Reconcile đêm**: so sánh tồn kho toàn bộ, đánh dấu chênh lệch lên màn hình "Cần kiểm tra".
6. **Ghi sang KiotViet**: qua hàng đợi `outbox`, idempotent (ghi mã Sugami vào mô tả/ghi chú để dò khi timeout), không retry mù khi tạo phiếu.
7. **Ngân sách request**: token bucket 4.500/giờ, ưu tiên: webhook follow-up > thao tác người dùng > tăng dần > reconcile.

## 2.8 Rủi ro & cách giảm

| Rủi ro | Giảm thiểu |
|--------|-----------|
| API thay đổi hoặc tài liệu không khớp | Giai đoạn 0 viết "contract test" chạy với store thật; adapter cô lập mọi chi tiết KiotViet |
| Hết hạn mức 5.000/giờ khi dữ liệu lớn | Đồng bộ tăng dần, webhook, cache, theo dõi request đã dùng |
| Lệch tồn giữa Sugami và KiotViet | KiotViet là master tồn ở giai đoạn đầu; mọi điều chỉnh từ Sugami đi bằng phiếu sang KiotViet; reconcile đêm |
| Phụ thuộc gói KiotViet (gói có API/liên kết sàn) | Xác nhận gói đang dùng; thiết kế adapter để có thể kết nối sàn trực tiếp sau này |
| Không có dữ liệu phí sàn | Nhập file đối soát Shopee/TikTok, sau đó dùng API sàn |

## 2.9 Nguồn tham khảo

- [KiotViet Public API (Retail)](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ket-noi-api/public-api/)
- [KiotViet: kết nối sàn TMĐT](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-online/ket-noi-san-tmdt/)
- [KiotViet: thiết lập webhook (bản Hotel, cách ký x-signature)](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/hotel-ket-noi-api/thiet-lap-webhook/)
- [kiotviet-client-sdk (TypeScript, cộng đồng)](https://epoxyteam.github.io/kiotviet-client-sdk/)
- [Ví dụ tích hợp đồng bộ sản phẩm/tồn qua webhook + reconcile](https://github.com/thienlng/agent-sale/pull/104)
