# sugami.vn — trang giới thiệu tĩnh

Trang giới thiệu công ty (HTML/CSS/JS thuần, không build), tách khỏi app ERP.

- `assets/`: logo, favicon lấy từ `apps/web/public/icons`.
- `concepts/`: các ý tưởng đang chờ chủ shop chọn (chủ shop đã duyệt tông màu, đợt 1 chưa ưng bố cục):
  1. `1-mo-hop-qua.html`: cuộn để mở hộp quà, nội dung bay ra theo từng chương.
  2. `2-ban-lam-viec.html`: màn hình kiểu máy tính, cửa sổ kéo thả, dock kênh bán.
  3. `3-ghep-khoi.html`: trò ghép pentomino 5×5, mỗi khối mở một phần giới thiệu.
  4. `4-tro-chuyen.html`: trang là một cuộc chat, khách chọn câu hỏi.
  5. `5-hanh-trinh.html`: cuộn ngang qua 4 chặng Chọn, Gói, Giao, Lớn lên.
  6. `6-chu-lon.html`: các dòng chữ khổng lồ, bấm để mở nội dung.
  7. `7-xap-the.html`: cuộn thì các thẻ lớn chồng lên nhau như xấp hồ sơ.
  8. `8-quy-dao.html`: các phần xoay quanh logo, bấm để mở bảng nội dung.
  9. `9-luoi-o.html`: lưới ô, bấm một ô để bung ra thành trang đầy đủ.

Chủ shop đã chốt hướng: ý tưởng 5 (cuộn ngang) kết thúc bằng lưới ô của ý tưởng 9. Bản ghép là `index.html` (sinh ra từ hai file concept, sửa trực tiếp ở đây từ nay).

Bảng màu lấy từ logo: hồng `#f16185`, hồng phấn `#f1a9b7`, xanh ngọc `#57c9c9`, vàng `#f0e761`, nâu đỏ `#641214`.

Link kênh bán trong `index.html` là link thật chủ shop gửi (Zalo 0981151720). Ảnh sản phẩm còn tạm. Xem thử: mở file trực tiếp bằng trình duyệt.

## Ảnh minh họa

`assets/img/*.jpg` là ảnh dựng 3D (quà tặng, đồ chơi, văn phòng, learn), tạo bằng `tools/render-scenes.html` với three.js 0.160.0. Muốn dựng lại: giải nén gói `three@0.160.0` vào `tools/three/`, chạy `python3 -m http.server` trong `tools/`, mở `render-scenes.html?s=A` (A, B, C, D) rồi lưu canvas. Khi có ảnh sản phẩm thật, thay trực tiếp các file trong `assets/img/`.
