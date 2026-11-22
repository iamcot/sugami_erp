# Cài Sugami lên điện thoại và bật thông báo

Sugami là web app cài được (PWA): có biểu tượng trên màn hình chính, mở toàn màn hình như app, nhận thông báo đẩy. Cần mở qua **https://erp.sugami.vn** (thông báo không chạy trên địa chỉ http, trừ localhost).

## 1. Tạo khóa thông báo (một lần, trên iMac)

```bash
pnpm --filter @sugami/notify build
pnpm --filter @sugami/notify vapid
```

Chép hai dòng in ra vào `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), khởi động lại api. Không gửi khóa qua chat. Đổi khóa thì mọi máy phải bật lại thông báo.

## 2. Cài app

- **iPhone (iOS 16.4 trở lên):** mở erp.sugami.vn bằng **Safari** → nút Chia sẻ → **Thêm vào MH chính**. Từ giờ mở Sugami từ biểu tượng này; iPhone chỉ cho bật thông báo khi mở từ màn hình chính.
- **Android:** mở bằng Chrome → menu ⋮ → **Cài đặt ứng dụng** (hoặc chọn "Cài Sugami lên máy" trong menu tài khoản).
- **Máy tính:** Chrome/Edge có biểu tượng cài ở thanh địa chỉ.

## 3. Bật thông báo

Bấm vào vòng tròn tên ở góc phải → **Bật thông báo** → cho phép. Bấm **Gửi thông báo thử** để kiểm tra. Mỗi điện thoại/máy tính bật riêng.

## Sugami sẽ báo gì

Hiện có thông báo thử. Các thông báo thật được thêm dần theo từng phần:

| Thông báo | Khi nào | Phần |
|-----------|---------|------|
| Đơn mới từ Shopee/TikTok | Có đơn qua Pancake | P4-P2 |
| Đồng bộ bị chậm | Quét bù đơn trễ quá 15 phút | P4-P2 |
| Nhắc đồng bộ KiotViet | Lâu chưa nhập hóa đơn | P1-17 |
| Tồn âm mới | Một SKU vừa âm | P1-17 |

## Khi iMac tắt

Máy đã tắt thì không tự gửi được thông báo. Đăng ký một dịch vụ kiểm tra miễn phí như **UptimeRobot** hoặc **Healthchecks.io**, cho nó gọi `https://erp.sugami.vn/health` mỗi 5 phút; nó sẽ báo qua email hoặc app của nó khi Sugami không trả lời. Khi máy lên lại, Sugami tự quét bù dữ liệu bị lỡ (xem [3.8](../03-kien-truc.md#38-khi-máy-tắt-hoặc-dịch-vụ-chết)).
