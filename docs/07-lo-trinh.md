# 7. Lộ trình

Bối cảnh đã xác nhận: vài trăm SKU, dưới 10 đơn/ngày, ngành đồ chơi, nhập từ Taobao/1688 qua đơn vị vận chuyển trung gian, và **mục tiêu dài hạn là thay KiotViet** khi đã có API trực tiếp của sàn.

Vì quy mô nhỏ, lộ trình ưu tiên **giá trị dùng ngay** (nguồn hàng, giá vốn thật, ảnh/content) và **sẵn sàng thoát KiotViet** ngay từ thiết kế: Sugami tự giữ sổ kho đầy đủ từ ngày đầu, KiotViet chỉ là một "kênh" có thể gỡ ra.

Claude viết toàn bộ code, commit thẳng lên `main`. Thời lượng dưới đây là ước lượng theo lịch, phụ thuộc nhiều vào các task 👤. Danh sách task chi tiết ở [09](09-ke-hoach-trien-khai.md), tiến độ ở [`PROGRESS.md`](../PROGRESS.md).

| GĐ | Tên | Thời lượng | Kết quả chính |
|----|-----|-----------|---------------|
| 0 | Chuẩn bị | 1–2 tuần | Khung dự án, prototype UI, file Excel mẫu KiotViet, **nộp hồ sơ app Shopee/TikTok** |
| 1 | Nền tảng + catalog + kho | 3–4 tuần | Đăng nhập, sản phẩm/biến thể, sổ kho; import/export **Excel** với KiotViet |
| 2 | Nguồn hàng Taobao/1688 + kho | 3–4 tuần | Đơn đặt hàng TQ, kiện hàng qua trung gian, landed cost, nhập kho, kiểm kho |
| 3 | Media & content | 2–3 tuần | Thư viện ảnh, preset ảnh sàn, content theo kênh |
| 4 | Kết nối sàn trực tiếp (TikTok Shop, Shopee) | 4–6 tuần | Bắt đầu ngay khi app được duyệt, song song GĐ2–3: đọc đơn, phí sàn, đẩy listing/ảnh |
| 5 | Thay KiotViet | 2–3 tuần | Sugami là master tồn & đơn, tắt liên kết sàn của KiotViet, hủy gói |
| 6 | Mở rộng | liên tục | Facebook/Zalo, website, báo cáo nâng cao, AI |

## Thay đổi 22/11/2026: không dùng KiotViet Public API

Gói KiotViet Chuyên nghiệp của shop không có Public API (chỉ gói Cao cấp). Chủ shop chọn: **kết nối thẳng Shopee/TikTok** sớm nhất có thể, trong lúc chờ duyệt app thì Sugami trao đổi dữ liệu với KiotViet bằng **file Excel**:

| Chiều | File | Tần suất (với < 10 đơn/ngày) |
|-------|------|------------------------------|
| KiotViet → Sugami | Danh sách hàng hóa kèm tồn | Lần đầu, sau đó khi cần đối chiếu |
| KiotViet → Sugami | Hóa đơn / đặt hàng | Hằng tuần (để làm báo cáo, lãi theo kênh) |
| Sugami → KiotViet | Phiếu nhập hàng (sau khi nhận kiện) | Mỗi lần nhận hàng |
| Sugami → KiotViet | Kiểm kho / điều chỉnh, sản phẩm mới | Khi có |

KiotViet vẫn giữ việc đồng bộ tồn và đơn với sàn cho tới GĐ5. Mỗi lần thao tác chỉ vài phút.

## GĐ0 — Chuẩn bị (tuần 1–2)

- [x] Khởi tạo monorepo, CI, Docker Compose (Redis; MySQL native).
- [x] Prototype 5 màn hình (chờ duyệt).
- [ ] **Nộp hồ sơ app Shopee Open Platform và TikTok Shop Partner Center ngay**, vì duyệt có thể mất vài tuần (hướng dẫn: [docs/ops/dang-ky-app-san.md](ops/dang-ky-app-san.md)).
- [ ] Xuất file Excel mẫu từ KiotViet (hàng hóa + tồn, hóa đơn, phiếu nhập, NCC, mẫu import) và phân tích định dạng.
- [ ] Rà soát SKU KiotViet ↔ Shopee ↔ TikTok, chuẩn hóa quy tắc đặt mã.
- [ ] Chuẩn bị iMac làm server: cài Docker, MySQL native, tắt ngủ, UPS, Cloudflare Tunnel cho `erp.sugami.vn`, lịch sao lưu.

**Hoàn thành khi:** hồ sơ app sàn đã nộp, có file Excel mẫu, prototype đã duyệt.

## GĐ1 — Nền tảng + catalog + kho (tuần 3–6)

- [ ] Auth, người dùng, vai trò, audit log.
- [ ] Catalog: sản phẩm, biến thể, nhóm, thương hiệu, thuộc tính đồ chơi.
- [ ] Sổ kho Sugami (append-only) ngay từ đầu.
- [ ] Import Excel hàng hóa + tồn và hóa đơn từ KiotViet; export Excel phiếu nhập/kiểm kho đúng mẫu import của KiotViet.
- [ ] Đối chiếu tồn giữa file KiotViet và sổ kho Sugami.
- [ ] Danh sách đơn, tồn kho, dashboard cơ bản.

**Hoàn thành khi:** import file thật khớp 100% SKU và tồn; một phiếu nhập xuất từ Sugami import vào KiotViet thành công và tồn trên sàn cập nhật.

## GĐ2 — Nguồn hàng Taobao/1688 + kho (tuần 7–10)

- [ ] Liên kết SKU ↔ link Taobao/1688, shop nguồn, giá CNY, lịch sử giá.
- [ ] Đơn đặt hàng TQ (PO): nhiều link trong một đợt, tỷ giá, phí mua hộ.
- [ ] **Kiện hàng qua đơn vị trung gian**: mã vận đơn nội địa TQ, mã kiện, cân nặng/khối, phí ship theo kg/m³, trạng thái (shop TQ giao → kho TQ → đang về VN → đã về).
- [ ] Phân bổ landed cost (giá hàng + ship nội địa TQ + phí trung gian + ship VN) → giá vốn VND thật cho từng SKU.
- [ ] Nhận hàng: quét mã, đếm, ghi hàng lỗi/thiếu (chụp ảnh để khiếu nại), xác nhận → phiếu nhập đẩy sang KiotViet.
- [ ] Kiểm kho trên điện thoại, thẻ kho, báo cáo xuất nhập tồn.
- [ ] Cảnh báo sắp hết + đề xuất đặt hàng theo tốc độ bán và thời gian hàng về (thường 7–20 ngày).

**Hoàn thành khi:** một đợt hàng thật từ 1688 đi hết luồng và giá vốn từng SKU khớp tính tay.

## GĐ3 — Media & content (tuần 11–13)

- [ ] Thư viện ảnh/video, tự gán SKU theo tên file, tải ảnh gốc từ link Taobao/1688 về làm tư liệu.
- [ ] Preset ảnh vuông 1:1 cho Shopee/TikTok, watermark, tải gói ảnh.
- [ ] Content theo kênh: tiêu đề, mô tả, cảnh báo an toàn đồ chơi theo độ tuổi; trợ lý AI dịch/viết lại mô tả từ trang Taobao (tùy chọn).

**Hoàn thành khi:** mọi SKU đang bán có đủ ảnh chuẩn và mô tả theo từng sàn.

## GĐ4 — Kết nối sàn trực tiếp

Bắt đầu **ngay khi app được duyệt**, có thể chạy song song GĐ2–3. Khi đơn đọc thẳng từ sàn, bỏ bước import Excel hóa đơn.

- [ ] Adapter **TikTok Shop**: OAuth shop, sản phẩm, đơn, phí/đối soát, webhook, đẩy listing + ảnh.
- [ ] Adapter **Shopee Open Platform**: OAuth shop, sản phẩm, đơn, phí/đối soát, push, đẩy listing + ảnh.
- [ ] Chế độ **"chỉ đọc"** trước: Sugami đọc đơn từ sàn song song với KiotViet 2 tuần, so khớp.
- [ ] Đối soát lãi thật theo đơn (doanh thu − phí sàn − giá vốn).

**Hoàn thành khi:** đơn đọc trực tiếp từ sàn khớp 100% với KiotViet trong 2 tuần, tạo được listing mới từ Sugami.

## GĐ5 — Thay KiotViet (tuần 20–22)

- [ ] Xử lý đơn hoàn toàn trong Sugami: xác nhận, đóng gói (quét đối chiếu), in phiếu, đổi trả.
- [ ] Bật Sugami đẩy tồn trực tiếp lên Shopee/TikTok; **cùng lúc** tắt đồng bộ tồn của KiotViet (tránh hai nguồn ghi).
- [ ] Chạy song song 1–2 tuần, có nút quay lại KiotViet nếu lệch.
- [ ] Xuất toàn bộ dữ liệu KiotViet lưu trữ (sản phẩm, khách, hóa đơn, phiếu nhập) trước khi hủy gói.
- [ ] Bán tại chỗ/khách quen: tạo đơn thủ công trong Sugami (không cần POS đầy đủ vì đơn ít).

**Hoàn thành khi:** 30 ngày vận hành không dùng KiotViet, không bán âm.

## GĐ6 — Mở rộng

- Đơn Facebook/Zalo, website riêng dùng catalog Sugami.
- Báo cáo nâng cao: lãi theo SKU/kênh, tuổi tồn, hiệu quả nguồn hàng.
- Thông báo Telegram/Zalo.

## Mốc kiểm soát

| Mốc | Tuần | Chủ shop cần làm |
|-----|------|------------------|
| M0 | 2 | Duyệt prototype, cung cấp API KiotViet, nộp hồ sơ app Shopee/TikTok |
| M1 | 6 | Dùng thử 1 tuần, báo sai lệch |
| M2 | 10 | Chạy một đợt hàng 1688 thật qua Sugami |
| M3 | 13 | Duyệt ảnh/content |
| M4 | 19 | Xác nhận đơn từ sàn khớp |
| M5 | 22 | Quyết định hủy gói KiotViet |
