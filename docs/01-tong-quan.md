# 1. Tổng quan & phạm vi

## 1.1 Bài toán

Shop bán hàng đa kênh (Shopee trước, TikTok Shop sau, cộng thêm Facebook/Zalo/website/cửa hàng) đang gặp các vấn đề quen thuộc:

- Tồn kho lệch giữa các kênh, bán âm hoặc giữ hàng ảo.
- Hình ảnh, mô tả sản phẩm nằm rải rác (máy tính, Drive, Zalo), mỗi sàn một phiên bản.
- Không theo dõi được giá vốn thật theo từng lô nhập, từng nhà cung cấp, nên không biết lãi thật.
- Đơn từ nhiều kênh xử lý trên nhiều màn hình khác nhau.

KiotViet đã giải quyết tốt phần bán hàng, tồn kho cơ bản và liên kết sàn (đồng bộ đơn, tồn, giá với Shopee/TikTok Shop/Lazada/Tiki). Nhưng KiotViet yếu ở quản lý nguồn hàng/sourcing, quản lý media & content, quy trình nội bộ và báo cáo lãi lỗ theo kênh.

## 1.2 Mục tiêu

Sugami ERP ban đầu là "lớp điều hành" nằm trên KiotViet, sau đó trở thành hệ thống chính thay KiotViet:

1. **Một nơi duy nhất** cho dữ liệu sản phẩm đầy đủ: SKU, biến thể, ảnh, video, mô tả theo từng kênh, thông số, nguồn hàng.
2. **Xuất nhập tồn chính xác** theo kho/chi nhánh, có sổ kho (ledger) truy vết từng biến động, giá vốn bình quân hoặc theo lô.
3. **Đơn hàng hợp nhất** từ mọi kênh (qua KiotViet, sau này trực tiếp từ sàn), xử lý trên một màn hình.
4. **Quản lý nguồn hàng**: nhà cung cấp, báo giá, đơn đặt hàng, hàng đang về, công nợ, đánh giá NCC.
5. **Content & media**: thư viện ảnh/video có tag, phiên bản theo kênh, lịch đăng nội dung.
6. **Báo cáo** lãi gộp theo SKU/kênh/thời gian, cảnh báo hết hàng, hàng chậm bán.
7. **Giao diện** trực quan, đơn giản, hiện đại, dùng tốt trên cả máy tính và điện thoại (kho dùng điện thoại quét mã).

## 1.3 Bối cảnh shop (đã xác nhận)

- Ngành đồ chơi, vài trăm SKU, dưới 10 đơn/ngày, bán chủ yếu qua Shopee và TikTok Shop.
- Nhập hàng từ Taobao/1688 qua một đơn vị vận chuyển trung gian.
- Đang dùng KiotViet (đã có API và liên kết sàn). Mục tiêu dài hạn: **thay KiotViet** bằng Sugami khi đã kết nối được API sàn trực tiếp, để cắt chi phí phần mềm.

## 1.4 Người dùng

| Vai trò | Việc chính |
|---------|-----------|
| Chủ shop | Xem tổng quan, báo cáo lãi, duyệt nhập hàng, cấu hình |
| Nhân viên kho | Nhập hàng, kiểm kho, đóng gói, chuyển kho (thường dùng điện thoại) |
| Nhân viên vận hành/CSKH | Xử lý đơn, đổi trả, ghi chú khách |
| Nhân viên content | Quản lý ảnh/video, viết mô tả, chuẩn bị listing cho sàn |
| Nhân viên mua hàng | Làm việc với NCC, đặt hàng, theo dõi hàng về |

## 1.5 Nguyên tắc thiết kế

- **Dùng KiotViet làm bàn đạp, không phụ thuộc lâu dài.** Giai đoạn đầu KiotViet vẫn là nơi liên kết sàn; Sugami đọc, bổ sung và tự giữ sổ kho để sau này thay thế KiotViet.
- **Nguồn sự thật rõ ràng cho từng loại dữ liệu** (xem mục 2.6 trong [02](02-kiotviet-api.md)). Không để hai hệ thống cùng ghi một trường.
- **Mọi biến động kho đi qua sổ kho** (append-only), không sửa số tồn trực tiếp.
- **Đồng bộ chịu lỗi**: webhook + quét định kỳ (reconcile) + idempotency, không tin webhook 100%.
- **Thiết kế adapter theo kênh** để thêm TikTok Shop, Shopee Open Platform trực tiếp, Lazada... mà không đổi lõi.
- **Đơn giản trước**: mỗi màn hình phục vụ một việc, ít bước nhất có thể.

## 1.6 Ngoài phạm vi (ít nhất trong năm đầu)

- Kế toán đầy đủ (sổ cái, báo cáo thuế). Chỉ làm công nợ NCC, thu chi đơn giản và xuất dữ liệu cho kế toán.
- Hóa đơn điện tử (dùng của KiotViet hoặc nhà cung cấp HĐĐT).
- POS bán tại quầy đầy đủ (đơn ít, chỉ cần tạo đơn thủ công).
- Quản lý nhân sự, chấm công, lương.
