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
- **Máy trạng thái** (`apps/api/src/pos/pos-flow.ts`): đơn bán tại quầy không đổi trạng thái bằng danh sách chọn mà bằng các nút ở chi tiết đơn, nút nào cũng ghi rõ tác động tồn.
  - *Bán thường*: hoàn thành ngay, trừ tồn lúc bán; nút **Trả hàng** / **Hủy đơn** hoàn tồn (`return_in`).
  - *Bán giao hàng*: Mới → **Xác nhận** → Đã xác nhận → **Đóng gói** → Đang đóng gói → **Giao cho ĐVVC** (trừ tồn, `sale_out`) → Đang giao → **Đã giao** → **Hoàn tất (đã thu đủ)** (ghi nhận đã thu đủ COD). **Hủy đơn** chỉ có trước khi giao cho ĐVVC, không đụng tồn. Đã giao đi thì chỉ còn **Hoàn hàng / Trả hàng** (hoàn tồn).
  - Đơn đã hủy/trả là trạng thái cuối. Máy chủ kiểm tra từng nút theo trạng thái hiện tại (hai người bấm cùng lúc: người sau nhận báo lỗi, tồn không bị trừ hai lần).
  - Đơn giao hàng tạo từ bản trước (đã trừ tồn lúc tạo) được cân lại tồn theo trạng thái ở lần bấm nút đầu tiên.
- Lọc ở trang Đơn hàng: kênh "Bán trực tiếp".

## Mẫu biên lai

Cài đặt → Mẫu biên lai (quyền `settings.write`, chủ shop có sẵn). Mẫu gồm các block: dòng chữ (căn lề, cỡ, đậm; biến `{{code}} {{date}} {{customer}} {{total}}`), thông tin đơn, chi tiết đơn hàng, tổng tiền/giảm giá/thanh toán, đường kẻ. Khổ 58 hoặc 80mm. Mẫu mặc định được in từ popup sau khi tạo đơn và nút "In biên lai" ở đơn. In qua hộp thoại in của trình duyệt (chọn máy in bill; tắt lề/đầu trang nếu cần). Biến môi trường `POS_WAREHOUSE` chọn kho (mặc định `KHO-CHINH`).

## Địa chỉ hành chính

Chọn Tỉnh/Thành phố và Phường/Xã (tìm không dấu) dùng danh sách mới sau sáp nhập 2025: 34 tỉnh/thành, 3.321 phường/xã, không còn cấp quận/huyện. Dữ liệu ở `apps/web/public/data/vn-units.json`, lấy từ gói npm `vietnam-address-database` (MIT, theo Nghị quyết 202/2025/QH15), tải một lần khi mở popup/biểu mẫu. Khách cũ từ KiotViet có "Khu vực" kiểu cũ ("Hà Nội - Quận Cầu Giấy"): hiển thị nguyên giá trị; chọn lại để chuyển sang địa chỉ mới. Popup khách hàng lưu `region` (tỉnh/thành) và `ward` (phường/xã).

## Phím tắt

Ô tìm hàng và ô tìm khách: ↓/↑ chọn dòng, Enter thêm/chọn, Esc xóa ô tìm (F3 quay lại ô tìm hàng). Ô chọn Tỉnh/Phường cũng dùng ↓/↑/Enter/Esc. Tab đi qua các ô nhập theo thứ tự màn hình, bỏ qua các nút nhỏ (±, xóa dòng, đóng) và dừng ở nút THANH TOÁN; trong ngăn xác nhận con trỏ vào ô "Khách thanh toán", Tab tiếp đến nút XÁC NHẬN, Esc đóng ngăn.

Khi lưu khách mới mà số điện thoại đã có khách, popup báo rõ khách đã có và cho chọn "Dùng khách này" hoặc sửa số điện thoại; không tự thay âm thầm.

## Header

Header của cả site nền xanh (thương hiệu). Trang Bán hàng đưa thanh công cụ của nó (icon đơn gần đây, ô tìm hàng, các tab) vào header qua `#app-header-slot` của `AppShell` (React portal) thay cho ô tìm chung; tên người dùng, chuông, trạng thái đồng bộ vẫn ở bên phải header. Nút **Giao cho ĐVVC** hỏi đối tác giao hàng và mã vận đơn (điền sẵn nếu đã nhập lúc tạo đơn) rồi mới trừ tồn.
