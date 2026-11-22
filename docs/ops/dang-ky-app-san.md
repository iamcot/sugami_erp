# Đăng ký app Shopee Open Platform và TikTok Shop (P0-08)

Mục tiêu: Sugami được đọc đơn, sản phẩm, phí sàn và sau này đẩy tồn/listing **trực tiếp** cho shop của chính mình, không qua KiotViet.

> Việc duyệt có thể mất vài ngày đến vài tuần, nên **nộp hồ sơ càng sớm càng tốt**. Giao diện đăng ký của hai sàn thay đổi thường xuyên; tên mục dưới đây có thể khác đôi chút. Chỗ nào khác hoặc bị hỏi giấy tờ lạ, chụp màn hình gửi trong chat.

## Chuẩn bị chung

| Thứ cần có | Ghi chú |
|-----------|---------|
| Tài khoản người bán Shopee và TikTok Shop đang hoạt động | Đăng nhập được Seller Center |
| Giấy đăng ký kinh doanh (hộ kinh doanh hoặc công ty) | Thường bị hỏi khi duyệt app, nhất là TikTok |
| Email riêng cho developer (vd `dev@sugami.vn`) | Không bắt buộc nhưng nên tách khỏi email cá nhân |
| Website/tên miền | `https://sugami.vn`, mô tả ngắn: hệ thống quản lý kho và đơn hàng nội bộ của shop |
| Redirect / callback URL | Shopee: `https://erp.sugami.vn/integrations/shopee/callback` · TikTok: `https://erp.sugami.vn/integrations/tiktok/callback` |

Mô tả app dùng khi được hỏi (có thể dán nguyên):

> Sugami ERP là hệ thống nội bộ của shop Sugami, chỉ dùng cho gian hàng của chính chúng tôi. Ứng dụng đọc đơn hàng, sản phẩm, tồn kho và đối soát tài chính để quản lý kho, nhập hàng và báo cáo lãi lỗ; cập nhật tồn kho và thông tin sản phẩm cho gian hàng của chúng tôi. Không phân phối cho người bán khác.

## 1. Shopee Open Platform

1. Vào **open.shopee.com** → **Get Access / Đăng ký**, tạo tài khoản developer (đăng nhập bằng tài khoản Shopee của shop hoặc email).
2. Khi được hỏi loại developer, chọn loại dành cho **người bán tự xây hệ thống nội bộ** (thường gọi là *Seller In-house System* / *Registered Business Seller*), **không** chọn *Third-party Partner / ISV*. **(cần xác minh tên mục khi đăng ký)**
3. Điền thông tin doanh nghiệp, tải giấy đăng ký kinh doanh nếu được yêu cầu, chờ duyệt tài khoản developer.
4. Sau khi được duyệt: **App Management → Create App**. Loại app: hệ thống nội bộ của người bán (*Seller In House System*). Điền tên `Sugami ERP`, mô tả ở trên, redirect URL ở trên.
5. Shopee cấp **Test Partner ID / Key** trước (dùng môi trường thử). Bản **Live** cần gửi duyệt thêm (Go Live).
6. Xin các nhóm quyền (API permissions): **Product**, **Order**, **Logistics**, **Payment / Returns** (đối soát, trả hàng), **Shop**.
7. Gửi cho mình (qua chat): trạng thái duyệt, loại app đã chọn. **Không gửi Partner Key qua chat**: điền vào `.env` trên iMac:

   ```
   SHOPEE_PARTNER_ID=
   SHOPEE_PARTNER_KEY=
   SHOPEE_ENV=test        # đổi thành live khi được duyệt
   ```

## 2. TikTok Shop Partner Center

1. Vào **partner.tiktokshop.com** (bản dành cho mọi thị trường ngoài Mỹ), đăng ký tài khoản.
2. Chọn loại developer **Seller (in-house) developer**: tự xây app cho shop của mình. Không chọn *App developer / ISV*.
3. Hoàn tất hồ sơ doanh nghiệp (giấy đăng ký kinh doanh, thông tin liên hệ). TikTok có thể gửi bảng câu hỏi kiểm tra (due diligence); trả lời theo mô tả ở trên.
4. **App & Service → Create app & service**, loại **Custom** (không công khai). Thị trường: **Vietnam**. Điền tên, mô tả, redirect URL; bật **Enable API**.
5. **Manage API**: xin quyền **Shop Authorized Information**, **Product**, **Order**, **Fulfillment/Logistics**, **Finance** (đối soát), **Return/Refund**.
6. Lưu lại **App key**, **App secret**, **Service ID** vào `.env` trên iMac (không gửi qua chat):

   ```
   TIKTOK_APP_KEY=
   TIKTOK_APP_SECRET=
   TIKTOK_SERVICE_ID=
   ```

7. Theo dõi mục **Launch checklist** trên trang app để biết còn bước duyệt nào.

## Sau khi được duyệt

Báo trong chat. Mình làm P4-02/P4-07 (kết nối OAuth): bạn chỉ cần bấm một link, đăng nhập Seller Center và bấm **Ủy quyền** cho Sugami.

## Tham khảo

- [Odoo: thiết lập Shopee Open Platform](https://www.odoo.com/documentation/19.0/applications/sales/sales/shopee_connector/setup.html)
- [Apideck: tạo app TikTok Shop, loại developer](https://developers.apideck.com/connectors/tiktok/docs/application_owner+oauth_credentials)
- [unified.to: TikTok Shop custom app](https://unified.to/blog/how_to_setup_a_tiktok_shop_application)
