# Trang chủ sugami.vn

Trang giới thiệu là file tĩnh trong `sites/sugami.vn/`, chạy trên **Cloudflare Pages** (miễn phí), không qua iMac. Máy shop tắt thì trang chủ vẫn sống.

## Bật lần đầu (chủ shop làm, khoảng 10 phút)

1. Cloudflare → **Workers & Pages** → **Create application**. Màn hình mặc định là tạo **Worker** (có ô *Deploy command*, không có *Build output directory*): đừng dùng. Bấm dòng nhỏ ở cuối: **Need to use the legacy Pages workflow? Continue to Pages** → **Import an existing Git repository** → chọn repo `iamcot/sugami_erp`.
2. Cấu hình:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: để trống
   - Build output directory: `sites/sugami.vn`
   - Nếu không thấy ô này: mở **Root directory (advanced)**, điền `sites/sugami.vn`, phần output để trống.
3. **Save and Deploy**. Xong sẽ có địa chỉ dạng `sugami-xxx.pages.dev` để xem thử.
4. Vào project vừa tạo → **Custom domains** → thêm `sugami.vn`, rồi thêm `www.sugami.vn`. Domain đã nằm trên Cloudflare nên nó tự tạo DNS. Nếu báo trùng bản ghi A/CNAME cũ của `sugami.vn` hoặc `www`, xóa bản ghi cũ trong **DNS → Records** rồi thêm lại. Đừng đụng bản ghi MX/TXT của email và các bản ghi `erp`, `hooks` của tunnel.
5. Để mỗi commit của ERP không làm Pages build lại vô ích: **Settings → Build → Build watch paths**, Include paths: `sites/sugami.vn/*`.

## Cập nhật nội dung

Mỗi lần code trong `sites/sugami.vn/` lên `main`, Pages tự đăng bản mới sau khoảng 1 phút.

## Chi phí

Gói Free của Pages: băng thông và lượt truy cập không giới hạn cho file tĩnh, 500 lần build mỗi tháng, tên miền riêng và HTTPS miễn phí. Trang này dùng không tới giới hạn nào.
