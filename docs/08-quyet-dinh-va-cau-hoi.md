# 8. Quyết định đã đề xuất & câu hỏi mở

## 8.1 Quyết định đề xuất (có thể thay đổi nếu chủ shop không đồng ý)

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | Sugami là lớp điều hành **trên** KiotViet, không thay KiotViet | KiotViet đã liên kết sàn và POS ổn định; giảm rủi ro, ra mắt nhanh |
| D2 | KiotViet là master **tồn kho và đơn hàng** ở GĐ1–3; Sugami là master **content, media, nguồn hàng, giá vốn** | Tránh hai hệ thống cùng ghi tồn, gây lệch trên sàn |
| D3 | Mọi thay đổi tồn từ Sugami ghi sang KiotViet bằng **phiếu** (nhập, điều chỉnh, chuyển), không sửa số tồn trực tiếp | Có chứng từ, truy vết được, khớp sổ kho |
| D4 | **SKU = mã hàng KiotViet = SKU người bán trên sàn** | Cách KiotViet tự liên kết sàn; một khóa xuyên suốt |
| D5 | TypeScript monorepo: Next.js + NestJS + PostgreSQL + Redis/BullMQ + R2 | Một ngôn ngữ, hệ sinh thái lớn, dễ tuyển người |
| D6 | Modular monolith, 1 VPS + Docker Compose | Đủ cho quy mô shop, chi phí thấp; tách service khi thật sự cần |
| D7 | Kết nối **TikTok Shop trực tiếp** ở GĐ4 cho content/listing/phí sàn; tồn vẫn đi qua KiotViet | Public API KiotViet không quản lý listing sàn |
| D8 | Web app responsive + PWA cho kho, chưa làm app native | Một code base; camera quét mã trên trình duyệt đã đủ tốt |

## 8.2 Câu hỏi mở cho chủ shop

1. **Quy mô**: khoảng bao nhiêu SKU (tính cả biến thể), bao nhiêu đơn/ngày, bao nhiêu kho/chi nhánh, bao nhiêu người dùng?
2. **Gói KiotViet** đang dùng có Public API và kết nối sàn chưa? Đã liên kết Shopee trong KiotViet chưa?
3. **SKU hiện tại** giữa KiotViet và Shopee đã khớp nhau chưa, hay cần một đợt chuẩn hóa?
4. **Ngành hàng** là gì (thời trang, mỹ phẩm, đồ gia dụng...)? Có cần quản lý lô/hạn dùng, serial/IMEI không?
5. **Nguồn hàng** chủ yếu từ đâu (1688/Taobao qua đơn vị order, xưởng, đại lý trong nước)? Có cần tính tiền tệ CNY và phí vận chuyển TQ–VN không?
6. Shop có muốn sau này **bỏ KiotViet** và để Sugami làm master toàn bộ không, hay giữ KiotViet lâu dài?
7. Các **kênh bán khác** cụ thể: Facebook, Zalo, website, Lazada, Tiki, cửa hàng offline?
8. **Content**: ai làm, quy trình hiện tại ra sao? Có muốn dùng AI viết mô tả/caption không?
9. **Hosting**: tự thuê VPS hay muốn dùng cloud (AWS/GCP), có ngân sách hàng tháng dự kiến?
10. **Đội phát triển**: ai sẽ code (tự làm, thuê ngoài, hay để Claude làm từng phần qua PR)? Điều này ảnh hưởng tới thời lượng các giai đoạn.
11. Cần **đăng nhập nhiều shop** (nhiều gian hàng KiotViet) trong cùng hệ thống không, hay chỉ một shop?

## 8.3 Việc cần xác minh kỹ thuật (GĐ0)

- Tên sự kiện webhook Retail, header chữ ký, cách băm body.
- Đường dẫn chính xác: tồn theo chi nhánh, bảng giá, chuyển hàng, trả hàng, kênh bán.
- Đơn sàn trong KiotViet: kiểu bản ghi, trường kênh bán, mã đơn sàn, phí.
- Giới hạn cho request ghi; thời hạn token thực tế.
- Tạo phiếu nhập/điều chỉnh qua API có tự cập nhật tồn lên sàn không, độ trễ bao lâu.
