# Định dạng file Excel KiotViet (P0-07)

Phân tích từ file mẫu chủ shop xuất ngày 22/11/2026, gói Chuyên nghiệp. File gốc **không commit** (có thông tin khách và NCC). Test dùng file tự sinh, dữ liệu giả.

Quy ước chung của mọi file:

- `.xlsx`, một sheet, dòng 1 là tiêu đề cột (tiếng Việt, có dấu). Đọc theo **tên cột**, không theo vị trí.
- Tên file: `<Loại>_KV<ddMMyyyy>-<HHmmss>-<ms>.xlsx`, ví dụ `DanhSachSanPham_KV22112026-134912-531.xlsx`.
- Số tiền là số thực (`129000.0`); giá vốn có lẻ (`8890.22`) → làm tròn về đồng khi import.
- Thời gian: ô kiểu ngày giờ (giờ Việt Nam, không có múi giờ), riêng cột `Ngày cập nhật` của hóa đơn là chuỗi `dd/MM/yyyy HH:mm`.
- Một chi nhánh: `Chi nhánh trung tâm` → kho `KHO-CHINH`.
- KiotViet đã che sẵn tên, SĐT, địa chỉ khách (`Đ******g`). Riêng cột `Ghi chú` của hóa đơn Shopee chứa **tên đăng nhập Shopee của người mua**: không lưu, không log.

## 1. Danh sách hàng hóa — `DanhSachSanPham_KV*.xlsx` (P1-11)

1.029 dòng, mỗi dòng **một mã hàng (= một SKU/biến thể)**.

| Cột | Dùng cho | Ghi chú từ dữ liệu thật |
|-----|----------|-------------------------|
| `Mã hàng` | `variant.sku` | Duy nhất. Đa số `SP000123`; có cả mã Shopee `SPO…`, mã vạch nhà sản xuất, mã tự đặt (`Y95D`, `0039`) → giữ nguyên, không đổi mã |
| `Mã HH Liên quan` | Gom biến thể vào một sản phẩm | Trỏ về mã hàng **cha**. Dòng cha không có giá trị này nhưng vẫn là một biến thể có thuộc tính riêng. 153 nhóm, 2–9 biến thể. Có mã cha không tồn tại (`SP000232A`) → báo lỗi dòng, coi dòng đó là sản phẩm riêng |
| `Thuộc tính` | `product_option` + `variant.option_values` | `Tên:Giá trị`, nhiều thuộc tính ngăn bằng `\|` (`Phân loại:Bộ Gia đình\|Số lượng:Combo 4 set`). Tách tên ở dấu `:` **đầu tiên** (giá trị có thể chứa `:`, vd `LOẠI:Tím: Hiện đại`). Tên hay gặp: LOẠI, MÀU, Mẫu, LEVEL, Phân loại, Màu sắc |
| `Tên hàng` | `product.name` | Lấy tên dòng cha. Tên biến thể có thể khác (vd `… #959 - Đen`) |
| `Nhóm hàng(3 Cấp)` | `category` | Hiện chỉ 1 cấp: Bé chơi, Đồ gia dụng, Bé đẹp, Bé học, Bé khỏe, Phụ kiện, Khác, Order, Ship. Mẫu chưa có nhóm nhiều cấp; dự kiến ngăn bằng `>>`, cần xác minh |
| `Thương hiệu` | `brand` | Gần như trống (Tupperware 66 dòng) |
| `Giá bán` | `variant.price` | Có dòng giá 0 → cảnh báo, vẫn import |
| `Giá vốn` | `variant.cost_avg` (qua phiếu tồn đầu kỳ) | Có lẻ → làm tròn |
| `Tồn kho` | Tồn đầu kỳ (`stock_movement` loại `kiotviet_import`) | Số nguyên. **78 mã tồn âm**, 315 mã tồn 0 → import đúng như vậy, báo ở P1-21 |
| `Tồn nhỏ nhất` | `variant.min_stock` | Toàn 0 |
| `Mã vạch` | `variant.barcode` | Chỉ 3 dòng có |
| `Trọng lượng` | `variant.weight_grams` | Gram; đa số 0/trống |
| `Hình ảnh (url1,url2...)` | Tải ảnh về S3 (P3) | 317 dòng có, link `cdn2-retail-images.kiotviet.vn`, nhiều link ngăn bằng `,` |
| `Mô tả` | `product.description` | 27 dòng có (văn bản thường) |
| `Đang kinh doanh` | `variant.status` (`1` = active) | |
| `Thời gian tạo` | Tham khảo | |
| `Loại hàng`, `ĐVT`, `Mã ĐVT Cơ bản`, `Quy đổi`, `Hàng thành phần`, `Vị trí`, `KH đặt`, `Dự kiến hết hàng`, `Tồn lớn nhất`, `Tích điểm`, `Được bán trực tiếp`, `Mẫu ghi chú`, `Tên hàng trên hóa đơn điện tử` | Bỏ qua | Shop không dùng đơn vị quy đổi, combo, vị trí |

Nhóm `Order` và `Ship` là dòng phí, không phải hàng: import với trạng thái lưu trữ (`archived`).

## 2. Hóa đơn — `DanhSachChiTietHoaDon_KV*.xlsx` (P1-12)

Bản **chi tiết**: một dòng cho mỗi dòng hàng, thông tin hóa đơn lặp lại trên mỗi dòng. 38 hóa đơn, 47 dòng. Bản tổng quan (`DanhSachHoaDon_KV*`, 9 cột) chỉ dùng đối chiếu tổng tiền.

| Cột | Dùng cho | Ghi chú |
|-----|----------|---------|
| `Mã hóa đơn` | Khóa chống trùng | `HDSPE_<mã đơn Shopee>` với đơn Shopee; `HD000123` với bán trực tiếp |
| `Mã đặt hàng` | | `DHSPE_<mã đơn Shopee>` |
| `Đối tác giao hàng` + tiền tố mã | Kênh | `HDSPE_` → Shopee. Chưa có đơn TikTok trong mẫu (dự kiến `HDTTS_`, cần xác minh khi có) |
| `Kênh bán` | | Tên gian hàng Shopee (`Cửa hàng nhỏ mẹ SuGaMi`, đối tác giao `SHOPEE`) hoặc `Bán trực tiếp` (đơn tự tạo, có khi giao qua `Shopee Xpress`) |
| `Mã vận đơn`, `Phí trả ĐTGH` | Vận chuyển | |
| `Thời gian` | `order.placed_at` | |
| `Trạng thái`, `Trạng thái giao hàng` | Trạng thái đơn | `Đang xử lý`/`Hoàn thành`; `Giao thành công`/`Đang giao hàng`/`Chờ xử lý` |
| `Mã hàng`, `Số lượng`, `Đơn giá`, `Giảm giá`, `Giá bán`, `Thành tiền` | Dòng đơn | Mọi mã hàng trong mẫu đều có trong danh sách hàng hóa |
| `Tổng tiền hàng`, `Giảm giá hóa đơn`, `Thu khác`, `Khách cần trả`, `Còn cần thu (COD)` | Tổng đơn | |
| `Mã khách hàng` | `customer.external_code` | `KHSPE…` |
| Tên/SĐT/địa chỉ khách và người nhận, `Ghi chú` | **Không lưu** | Đã bị che hoặc chứa username Shopee |

## 3. Phiếu nhập hàng — `DanhSachChiTietNhapHang_KV*.xlsx`

Bản chi tiết, một dòng mỗi mặt hàng: `Mã nhập hàng` (`PN000792`), `Thời gian`, `Mã nhà cung cấp`, `Tên nhà cung cấp`, `Mã hàng`, `Số lượng`, `Đơn giá`, `Giảm giá`, `Giá nhập`, `Thành tiền`, `Trạng thái` (`Đã nhập hàng`). Dùng để đối chiếu giá vốn, không cần import thường xuyên.

## 4. Nhà cung cấp — `DanhSachNhaCungCap_KV*.xlsx`

`Mã nhà cung cấp` (`NCC000003`), `Tên nhà cung cấp`, `Điện thoại`, `Địa chỉ`, `Khu vực`, `Phường/Xã`, `Tổng mua`, `Nợ cần trả hiện tại`, `Mã số thuế`, `Nhóm nhà cung cấp`, `Trạng thái`. 3 NCC; phiếu nhập thường dùng `NCC lẻ`. Import một lần ở P2 (nguồn hàng).

## 5. Mẫu import phiếu nhập — `MauFileNhapHang.xlsx` (P1-13, Sugami → KiotViet)

Sheet `PurchaseOrderTemplate`, 7 cột, đúng thứ tự:

| Cột | Kiểu | Ghi |
|-----|------|-----|
| `Mã hàng` | chuỗi | Bắt buộc, khớp mã KiotViet |
| `Tên hàng` | chuỗi | Để trống được |
| `Đơn vị tính` | chuỗi | Để trống |
| `Đơn giá` | số | Giá nhập (VND) |
| `Giảm giá` | số | Giảm theo tiền, hoặc trống |
| `Giảm giá (%)` | số | Trống nếu dùng cột trên |
| `Số lượng` | số | |

Phí ship/thuế từ trung gian đã phân bổ vào giá vốn ở Sugami → xuất `Đơn giá` = giá vốn đã phân bổ, `Giảm giá` trống.

## 6. Mẫu import kiểm kho — `MauFileKiemKho.xlsx` (P1-13, Sugami → KiotViet)

Sheet `StockTakeTemplate`, 2 cột: `Mã hàng` (chuỗi), `Số lượng` (số nguyên, định dạng `#,##0`). `Số lượng` là **tồn thực tế sau kiểm**, không phải số chênh lệch: KiotViet tự tính chênh lệch và cân bằng kho. Sugami xuất tồn hiện tại theo sổ kho cho các mã cần chỉnh.

## 7. Mẫu import hàng hóa — `MauFileSanPham.xlsx` (P1-13, sản phẩm mới Sugami → KiotViet)

Sheet `ProductTemplate`, 26 cột, **cùng tên và thứ tự với file danh sách hàng hóa** (mục 1) nhưng bỏ `KH đặt`, `Dự kiến hết hàng`, `Thời gian tạo`:

`Loại hàng`, `Nhóm hàng(3 Cấp)`, `Mã hàng`, `Mã vạch`, `Tên hàng`, `Tên hàng trên hóa đơn điện tử`, `Thương hiệu`, `Giá bán`, `Giá vốn`, `Tồn kho`, `Tồn nhỏ nhất`, `Tồn lớn nhất`, `ĐVT`, `Mã ĐVT Cơ bản`, `Quy đổi`, `Thuộc tính`, `Mã HH Liên quan`, `Hình ảnh (url1,url2...)`, `Trọng lượng`, `Tích điểm`, `Đang kinh doanh`, `Được bán trực tiếp`, `Mô tả`, `Mẫu ghi chú`, `Vị trí`, `Hàng thành phần`.

Sugami xuất các mã mới chưa có trên KiotViet: `Loại hàng` = `Hàng hóa`, `Tồn kho` = 0 (tồn vào KiotViet qua phiếu nhập), `Quy đổi` = 1, `Đang kinh doanh` = 1, `Được bán trực tiếp` = 1, `Thuộc tính` dạng `Tên:Giá trị|…`, `Mã HH Liên quan` = mã cha. Mẫu có ví dụ `Vị trí` ngăn bằng `|`.

## Còn thiếu

- Một đơn TikTok Shop (nếu có) để biết tiền tố mã hóa đơn.
