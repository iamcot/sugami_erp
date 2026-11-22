# 5. Các module chức năng

Mỗi module ghi: mục đích, chức năng chính, giai đoạn (GĐ) dự kiến.

## M1. Tổng quan (Dashboard) — GĐ1, mở rộng dần

- Doanh thu, số đơn, lãi gộp hôm nay / 7 ngày / 30 ngày, so với kỳ trước.
- Doanh thu theo kênh (Shopee, TikTok, cửa hàng, khác).
- Việc cần làm: đơn chờ xử lý, hàng sắp hết, PO sắp về, lỗi đồng bộ, content chờ duyệt.
- Top SKU bán chạy, SKU tồn lâu không bán.

## M2. Sản phẩm (Catalog) — GĐ1

- Danh sách sản phẩm dạng bảng + dạng lưới ảnh; lọc theo nhóm, thương hiệu, trạng thái, kênh, tồn.
- Trang chi tiết dạng tab: Thông tin · Biến thể · Hình ảnh · Content theo kênh · Tồn kho · Nguồn hàng · Lịch sử.
- Tạo biến thể nhanh: chọn thuộc tính (Màu × Size) → sinh ma trận SKU theo quy tắc đặt mã (vd `AO-THUN-DEN-M`).
- Kiểm tra SKU: trùng, thiếu, không khớp với KiotViet/sàn.
- Combo/bộ sản phẩm, đơn vị quy đổi.
- Import/export Excel; sửa hàng loạt (giá, nhóm, tag, trạng thái).
- In tem mã vạch.

## M3. Kho & xuất nhập tồn — GĐ1 (xem), GĐ2 (ghi)

- **Tồn kho**: theo SKU × kho: tồn thực, đang giữ (đơn chưa giao), đang về (PO), có thể bán.
- **Phiếu nhập** (từ PO hoặc nhập lẻ), **phiếu xuất** (hủy, hư, mẫu, quà), **chuyển kho**, **điều chỉnh**.
- **Kiểm kho**: tạo phiên kiểm theo kho/nhóm/kệ, quét mã bằng điện thoại, so sánh với tồn hệ thống, duyệt chênh lệch → sinh phiếu điều chỉnh (đẩy sang KiotViet).
- **Thẻ kho** từng SKU: mọi biến động theo thời gian, lọc theo loại.
- **Báo cáo xuất nhập tồn** theo kỳ: tồn đầu, nhập, xuất, tồn cuối, giá trị.
- **Cảnh báo**: dưới mức tối thiểu, đề xuất số lượng đặt dựa trên tốc độ bán 30 ngày và lead time NCC.
- Lô/hạn dùng (tùy chọn theo ngành hàng).

## M4. Nguồn hàng (Sourcing) — GĐ2

- Danh bạ NCC: nguồn (1688, Taobao, xưởng, đại lý trong nước), liên hệ, điều khoản, thời gian giao, đánh giá.
- Liên kết SKU ↔ NCC: link sản phẩm gốc, mã NCC, MOQ, giá lần cuối, lịch sử giá.
- Báo giá: đính kèm file/ảnh, so sánh nhiều NCC cho cùng SKU.
- Đơn đặt hàng NCC (PO): nháp → gửi → xác nhận → nhận một phần / đủ. Hỗ trợ ngoại tệ (CNY) + tỷ giá.
- Chi phí cập kho (landed cost): ship nội địa TQ, ship về VN, thuế, phí dịch vụ; phân bổ theo giá trị/số lượng/cân nặng → giá vốn thật.
- Công nợ & thanh toán NCC.
- Hàng đang về: dòng thời gian PO, ngày dự kiến, cảnh báo trễ.

## M5. Đơn hàng đa kênh — GĐ1 (xem), GĐ3 (xử lý)

- Danh sách đơn hợp nhất từ mọi kênh, lọc theo kênh, trạng thái, ngày, kho.
- Quy trình nội bộ: xác nhận → soạn hàng → đóng gói (quét mã đối chiếu SKU) → bàn giao vận chuyển.
- Phiếu soạn hàng gom nhiều đơn (pick list), in phiếu đóng gói.
- Đổi trả: nhận hàng hoàn, kiểm tra tình trạng, nhập lại kho hoặc ghi hỏng.
- Ghi chú nội bộ, tag đơn, lịch sử khách.
- Tạo đơn thủ công cho kênh Facebook/Zalo/điện thoại → đẩy sang KiotViet thành đơn đặt hàng.
- Đối soát: nhập file đối soát của Shopee/TikTok để có phí sàn, tiền thực nhận.

## M6. Kênh bán hàng — GĐ1 (KiotViet), GĐ4 (TikTok trực tiếp), GĐ5 (khác)

- Quản lý kết nối: KiotViet (qua Public API), sau đó TikTok Shop, Shopee Open Platform, Lazada.
- Trạng thái đồng bộ từng kênh, lần chạy gần nhất, số request đã dùng, lỗi.
- Ánh xạ listing: SKU Sugami ↔ sản phẩm/SKU trên sàn; báo SKU chưa liên kết.
- Quy tắc tồn đẩy lên kênh: % tồn, giữ lại tồn an toàn, ẩn khi dưới N.
- Bảng giá theo kênh.

## M7. Hình ảnh & media — GĐ2

- Thư viện tập trung: kéo thả tải lên hàng loạt, tự nhận SKU từ tên file (`SKU_01.jpg`).
- Tag, thư mục ảo, tìm theo SKU/tag/màu; phát hiện ảnh trùng (checksum/perceptual hash).
- Tự sinh phiên bản: vuông 1:1 1000px (chuẩn Shopee/TikTok), thumbnail, WebP; tùy chọn watermark logo, khung viền.
- Gắn ảnh vào sản phẩm/biến thể, sắp xếp ảnh chính, ảnh theo kênh.
- Tải về gói ảnh của một sản phẩm theo chuẩn từng sàn (zip).
- Kiểm tra chất lượng: cảnh báo ảnh nhỏ hơn chuẩn, sai tỉ lệ, thiếu ảnh biến thể.

## M8. Content shop — GĐ3

- Content sản phẩm theo kênh: tiêu đề (đếm ký tự theo giới hạn sàn), mô tả, bullet, từ khóa; mẫu (template) cho từng sàn.
- Quy trình duyệt: nháp → chờ duyệt → đã duyệt → đã đăng; lưu phiên bản.
- Trợ lý viết mô tả bằng AI (tùy chọn): sinh nháp từ thông số + ảnh, người duyệt chỉnh.
- Lịch content (calendar) cho bài Facebook/TikTok/Zalo: ý tưởng → nháp → lên lịch → đã đăng, gắn sản phẩm và media.
- Bộ sưu tập/chiến dịch: nhóm sản phẩm + content cho sale 9.9, 11.11, Tết.

## M9. Báo cáo — GĐ3

- Lãi gộp theo SKU / nhóm / kênh / thời gian (doanh thu − giá vốn − phí sàn − ship nếu có).
- Xuất nhập tồn, giá trị tồn kho, tuổi tồn kho (aging).
- Hiệu quả NCC: đúng hạn, tỷ lệ lỗi, biến động giá.
- Phân tích ABC (doanh thu) và đề xuất nhập hàng.
- Xuất Excel mọi báo cáo.

## M10. Hệ thống — GĐ1

- Người dùng, vai trò, phân quyền theo module và kho.
- Nhật ký thao tác.
- Cài đặt: quy tắc mã SKU, mẫu in, đơn vị, thuế, tiền tệ.
- Thông báo: trong app + Telegram/Zalo OA (hết hàng, lỗi đồng bộ, PO trễ).
- Trung tâm đồng bộ: hàng đợi, lỗi, chạy lại, lịch sử webhook.
