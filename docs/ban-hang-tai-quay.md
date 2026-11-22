# Bán hàng tại quầy (POS)

Trang **Bán hàng** (`/pos`) thay màn hình bán hàng của KiotViet.

- **Nhiều đơn nháp cùng lúc**: mỗi tab "Hóa đơn N" lưu trên máy chủ (`pos_drafts`), tải lại trang vẫn còn, tối đa 20 tab.
- **Hai loại**: *Bán thường* (lấy ngay, đơn hoàn thành tại chỗ) và *Bán giao hàng* (người nhận, địa chỉ, đối tác giao hàng, phí ĐTGH, mã vận đơn, thu hộ COD; đơn bắt đầu ở "Mới").
- Tìm hàng theo mã/mã vạch/tên (F3); Enter với mã vạch khớp tự thêm dòng. Giá từng dòng sửa được; giảm giá và thu khác theo cả đơn. Hàng vượt tồn vẫn bán được (tồn âm, có cảnh báo).
- Danh sách tìm hàng và dòng hàng có ảnh. Màn hình cố định theo khung: chỉ danh sách dòng hàng và cột phải cuộn.
- Cột phải chọn ngày giờ bán (mặc định bây giờ, không chọn tương lai). Chọn khách thì hiện thẻ khách hàng (bấm mở popup chi tiết, sửa và lưu được); đơn giao hàng tự điền người nhận/địa chỉ từ khách.
- Icon danh sách bên trái ô tìm hàng mở ngăn trượt các đơn bán gần đây; bấm một đơn mở nó thành một tab ngay trên thanh tab của trang bán hàng (cạnh các Hóa đơn nháp), xem chi tiết, đổi trạng thái và in lại biên lai tại đó; popup tạo đơn thành công cũng có nút Xem đơn mở tab này.
- **THANH TOÁN** mở ngăn xác nhận (ngày giờ, giảm giá, thu khác, khách thanh toán, hình thức tiền mặt/chuyển khoản/thẻ/ví, gợi ý số tiền); bấm **XÁC NHẬN** mới tạo đơn rồi hiện popup thành công kèm nút In biên lai.
- Tạo đơn `orders` (kênh `store`, nguồn `pos`, mã `BH000001…`), trừ tồn bằng `sale_out` qua sổ kho trong cùng transaction, xóa nháp.
- **Đổi trạng thái tay** ở chi tiết đơn (chỉ đơn `pos`): Hủy/Trả hàng hoàn tồn (`return_in`), mở lại thì trừ lại.
- Lọc ở trang Đơn hàng: kênh "Bán trực tiếp".

## Mẫu biên lai

Cài đặt → Mẫu biên lai (quyền `settings.write`, chủ shop có sẵn). Mẫu gồm các block: dòng chữ (căn lề, cỡ, đậm; biến `{{code}} {{date}} {{customer}} {{total}}`), thông tin đơn, chi tiết đơn hàng, tổng tiền/giảm giá/thanh toán, đường kẻ. Khổ 58 hoặc 80mm. Mẫu mặc định được in từ popup sau khi tạo đơn và nút "In biên lai" ở đơn. In qua hộp thoại in của trình duyệt (chọn máy in bill; tắt lề/đầu trang nếu cần). Biến môi trường `POS_WAREHOUSE` chọn kho (mặc định `KHO-CHINH`).
