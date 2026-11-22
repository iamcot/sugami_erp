# 6. Định hướng UI/UX

## 6.1 Nguyên tắc

1. **Một màn hình, một việc chính.** Hành động chính luôn là nút nổi bật duy nhất góc phải trên.
2. **Dữ liệu trước, trang trí sau.** Nền sáng, nhiều khoảng trắng, chữ rõ; màu chỉ dùng cho trạng thái và hành động.
3. **Nhanh như bàn phím.** Command palette `Ctrl/⌘ + K` để tìm SKU, đơn, NCC và nhảy tới bất kỳ màn hình nào; phím tắt cho thao tác lặp lại.
4. **Sửa tại chỗ.** Sửa giá, tồn tối thiểu, tag ngay trong bảng; không mở form khi không cần.
5. **Điện thoại cho kho.** Màn hình kiểm kho, nhận hàng, đóng gói tối ưu cho điện thoại một tay: nút to, quét mã bằng camera, phản hồi âm thanh/rung.
6. **Trạng thái đồng bộ luôn thấy được.** Mỗi sản phẩm/đơn có chấm trạng thái (đã đồng bộ, đang chờ, lỗi) và nút "đồng bộ lại".
7. **Tiếng Việt tự nhiên**, tìm kiếm không dấu, định dạng tiền `1.250.000 ₫`, ngày `22/11/2026`.

## 6.2 Hệ thống thiết kế

- Nền tảng: shadcn/ui + Tailwind; font **Inter** (hỗ trợ tiếng Việt tốt) hoặc **Be Vietnam Pro**.
- Màu: trung tính (slate) cho nền/chữ; 1 màu thương hiệu Sugami cho hành động chính; xanh lá = tốt/đã đồng bộ, vàng = cảnh báo, đỏ = lỗi/hết hàng.
- Bo góc 8–12px, bóng đổ nhẹ, mật độ "comfortable" mặc định, có chế độ "compact" cho bảng dài.
- Chế độ sáng/tối.
- Biểu tượng: Lucide.

## 6.3 Bố cục chung

```
┌───────────────┬───────────────────────────────────────────────────────┐
│ Sugami        │  🔍 Tìm SKU, đơn, NCC... (⌘K)        🔔  ⟳ Đồng bộ  👤 │
│               ├───────────────────────────────────────────────────────┤
│ ▣ Tổng quan   │  Sản phẩm                          [ + Thêm sản phẩm ] │
│ ▢ Sản phẩm    │  ┌─────────┬─────────┬─────────┬─────────┐            │
│ ▢ Kho         │  │ Tất cả  │ Đang bán│ Sắp hết │ Lỗi sync│  ⊞ ☰       │
│ ▢ Đơn hàng    │  └─────────┴─────────┴─────────┴─────────┘            │
│ ▢ Nguồn hàng  │  [Nhóm ▾] [Kênh ▾] [Tồn ▾]            Sửa hàng loạt ▾  │
│ ▢ Media       │  ┌──┬────────────────────┬──────┬───────┬──────┬────┐ │
│ ▢ Content     │  │🖼│ Áo thun basic đen M │AT-ĐE-M│189.000│ 42 ● │ ⋯  │ │
│ ▢ Báo cáo     │  │🖼│ Áo thun basic đen L │AT-ĐE-L│189.000│  3 ▲ │ ⋯  │ │
│ ─────────     │  └──┴────────────────────┴──────┴───────┴──────┴────┘ │
│ ⚙ Cài đặt     │                                    ‹ 1 2 3 … 40 ›     │
└───────────────┴───────────────────────────────────────────────────────┘
```

- Sidebar thu gọn được; trên điện thoại chuyển thành thanh điều hướng dưới (5 mục: Tổng quan, Đơn, Quét, Kho, Thêm).
- Tab nhanh ("saved views") trên mỗi danh sách, người dùng tự lưu bộ lọc.
- Bảng: cột tùy chọn, ghim cột, chọn nhiều → thanh hành động nổi.
- Bảng chi tiết mở dạng **drawer** bên phải để không mất ngữ cảnh danh sách; mở trang riêng khi cần sửa nhiều.

## 6.4 Màn hình chính

| Màn hình | Điểm nhấn |
|---------|-----------|
| Tổng quan | 4 thẻ KPI, biểu đồ doanh thu theo kênh, khối "Việc cần làm" có thể bấm vào |
| Danh sách sản phẩm | Chuyển bảng/lưới ảnh, sửa tại chỗ, chấm trạng thái đồng bộ theo kênh |
| Chi tiết sản phẩm | Tab: Thông tin · Biến thể (ma trận) · Ảnh (kéo thả) · Content theo kênh · Tồn · Nguồn hàng · Lịch sử |
| Tồn kho | Ma trận SKU × kho, tô màu theo mức tồn, nhấn vào ô để xem thẻ kho |
| Nhận hàng (mobile) | Chọn PO → quét mã → nhập số lượng → chụp ảnh hàng lỗi → xác nhận |
| Kiểm kho (mobile) | Quét liên tục, hiển thị đã quét/còn thiếu, đồng bộ offline khi mất mạng |
| Đơn hàng | Kanban theo trạng thái hoặc bảng; đóng gói: quét SKU từng món, báo sai món |
| Nguồn hàng | Thẻ NCC, PO dạng dòng thời gian, so sánh báo giá cạnh nhau |
| Media | Lưới ảnh kiểu thư viện, kéo thả tải hàng loạt, tự gán SKU theo tên file, xem trước khung ảnh theo sàn |
| Content | Trình soạn 2 cột: trái là nội dung, phải là xem trước như trên Shopee/TikTok, bộ đếm ký tự |
| Trung tâm đồng bộ | Trạng thái từng kết nối, hạn mức API đã dùng, danh sách lỗi + nút chạy lại |

## 6.5 Trải nghiệm đầu tiên (onboarding)

1. Tạo tài khoản → nhập tên shop.
2. Kết nối KiotViet: dán client_id, client_secret, tên gian hàng → kiểm tra kết nối.
3. Chọn chi nhánh làm kho → xem trước số sản phẩm, đơn → bắt đầu import (thanh tiến trình).
4. Báo cáo sức khỏe dữ liệu: SKU trùng/thiếu, sản phẩm thiếu ảnh, tồn âm.
5. Mời nhân viên và gán vai trò.

## 6.6 Wireframe & prototype

Ở Giai đoạn 0 sẽ làm prototype bấm được (Figma hoặc trang Next.js tĩnh dùng dữ liệu mẫu) cho 5 màn hình: Tổng quan, Danh sách sản phẩm, Chi tiết sản phẩm, Kiểm kho mobile, Media. Chủ shop duyệt trước khi code thật.
