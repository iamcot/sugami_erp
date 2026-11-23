# Vận chuyển qua Allingo

Đơn **shop tự giao** (Bán giao hàng tại quầy, sau này Facebook/Zalo) tạo vận đơn ở [Allingo](https://docs.allingo.vn/vi/api-reference/introduction), cổng chung tới GHN, GHTK, J&T, SPX, Viettel Post, VNPost, AhaMove, Grab Express... Đơn Shopee/TikTok do sàn gán hãng, không đi qua Allingo.

## Cách hoạt động

```
Chi tiết đơn → Tạo vận đơn → API (báo phí, tạo, hủy, in) ──▶ Allingo ──▶ hãng vận chuyển
                                   ▲                              │
                 worker: quét 15 phút ◀──────── webhook ký HMAC ◀─┘ (hooks.sugami.vn)
```

- **Báo phí**: `POST /inquiries`. Bảng giá có hai tab: Giao thường (chọn sẵn hãng đặt trong Cài đặt, mặc định SPX) và Giao nhanh (chọn sẵn bên rẻ nhất). Nhãn Rẻ nhất / Nhanh nhất tính trong từng tab.
- **Tạo vận đơn**: `POST /orders` kèm `Idempotency-Key = ship-<mã đơn>-<lần thứ>`. Sugami lưu dòng `shipments` trước khi gọi; mất mạng giữa chừng thì bấm lại, Allingo trả đúng vận đơn cũ chứ không tạo thêm. Allingo từ chối (4xx) thì lần sau dùng khóa mới.
- **Phí ship**: mặc định khách trả hãng (`payee = receiver`, thu tiền mặt khi giao). Ô *Cộng phí ship vào đơn* → shop trả hãng từ ví Allingo (`payee = sender`, `credit`), phí cộng vào tổng đơn và tiền thu hộ COD.
- **Hộp**: Sugami chọn theo tổng cân nặng (nhỏ ≤ 500 g, vừa ≤ 3 kg, lớn > 3 kg; sửa trong Cài đặt → Vận chuyển). Sản phẩm chưa có cân nặng được tính theo cân giả định (mặc định 200 g).
- **Không mua bảo hiểm** (`use_insurance = false`), theo chủ shop.
- **Trạng thái về đơn**:

| Allingo | Đơn Sugami | Tồn |
| --- | --- | --- |
| `queued`, `courier_assigned`... | giữ nguyên | còn giữ chỗ |
| `picked_up`, `in_transit`... | Đang giao | trừ tồn (`sale_out`), đúng một lần |
| `completed` | Đã giao | không đổi |
| `deliver_failed` | giữ nguyên, báo đẩy "Giao lỗi" | không đổi |
| `return_active` | giữ nguyên, báo "đang hoàn" | không đổi |
| `return_finished` | Hoàn hàng chờ xử lý | chọn *Nhập lại kho* hoặc *Không nhập kho* trong đơn |
| `canceled` | giữ nguyên, tạo vận đơn mới được | còn giữ chỗ |

"Hoàn tất (đã thu đủ)" vẫn bấm tay (tự động theo đối soát COD là giai đoạn 3).

## AhaMove chung bảng giá

AhaMove không có trong Allingo nên được gọi **thẳng API AhaMove** (`apps/api/src/pos/ahamove.ts`, `packages/channels/ahamove`, nhóm `AHAMOVE_*` trong `.env`, xem `docs/ban-hang-tai-quay.md`). Bảng giá của *Tạo vận đơn* gom cả hai nguồn: AhaMove nằm ở tab **Giao nhanh** cùng Grab, Lalamove của Allingo; nhãn Rẻ nhất / Nhanh nhất tính chung. Một nguồn lỗi chỉ hiện cảnh báo, không che nguồn kia.

Chọn dòng AhaMove thì khác Allingo ở chỗ: tài xế được gọi ngay nhưng đơn vẫn ở *Đang đóng gói* (chuyến lưu trên đơn). Khi AhaMove báo tài xế đã lấy hàng (`IN PROCESS`) đơn mới sang *Đang giao* và trừ tồn; hủy chuyến lúc đang đóng gói thì đơn được giải phóng để gọi lại; trạng thái theo webhook `/webhooks/ahamove` hoặc nút *Cập nhật trạng thái* trong thẻ vận chuyển. Chuyến AhaMove nằm trên chính đơn (`carrier`, `tracking_no`, `tracking_url`), không có dòng `shipments`.

## Cài đặt (làm một lần)

1. **Khóa thử.** Vào [developer.allingo.vn](https://developer.allingo.vn), tạo app, lấy cặp khóa thử `app_test_...` / `sk_test_...`. Khóa thử chạy qua hãng giả lập, không tốn tiền, không có vận đơn thật.
2. **Điền `.env` trên iMac** (không commit):

   ```
   ALLINGO_APP_ID=app_test_...
   ALLINGO_APP_SECRET=sk_test_...
   ALLINGO_WEBHOOK_SECRET=        # bước 4
   ```

   Rồi `pm2 restart all --update-env`.
2b. **Thử AhaMove** (chỉ đọc, không tạo chuyến): đặt `AHAMOVE_ENV=stg`, `AHAMOVE_API_KEY`, `AHAMOVE_MOBILE`, `AHAMOVE_PICKUP_NAME/PHONE/ADDRESS` trong `.env` rồi chạy `pnpm ahamove:probe`. Lệnh liệt kê dịch vụ của thành phố và báo giá thử từng dịch vụ tới một địa chỉ mẫu (đổi bằng `AHAMOVE_PROBE_DROPOFF`).
3. **Kiểm tra kết nối** (chỉ đọc, không tạo gì): `pnpm allingo:probe`. Lệnh lấy token, liệt kê hãng, báo phí thử một địa chỉ **chỉ có chữ, không có tọa độ**. In `Text-only quote accepted` là Allingo nhận địa chỉ chữ; nếu báo `validation_failed` thì cần thêm bước tìm tọa độ (xem Rủi ro trong kế hoạch).
4. **Webhook.** Trong portal Allingo, mục webhook của app:
   - URL: `https://hooks.sugami.vn/api/webhooks/allingo` (qua Cloudflare Tunnel, cùng đường với Pancake).
   - Đăng ký các sự kiện: `delivery.created`, `delivery.status_changed`, `delivery.driver_assigned`, `delivery.completed`, `delivery.cancelled`, `delivery.failed`.
   - Portal hiện `webhookSecret` **một lần**: chép vào `ALLINGO_WEBHOOK_SECRET` trong `.env`, restart. Khóa thử và khóa thật có secret riêng; URL thử và URL thật cấu hình riêng.
   - Allingo ký mỗi lần gửi bằng `X-AllinGo-Signature: t=<giây>,v1=<hex>` (HMAC-SHA256 của `t.body`). Sugami kiểm trên dữ liệu gốc, từ chối nếu lệch quá 300 giây, lưu theo `evt_...` nên gửi lặp không tạo bản trùng, trả 200 ngay; worker xử lý sau (mỗi phút).
   - Allingo gửi lại tối đa 8 lần trong khoảng 44 giờ. iMac tắt lâu hơn thế thì worker quét 15 phút một lần (và ngay khi khởi động) vẫn đọc lại trạng thái từ Allingo.
5. **Điểm lấy hàng và cỡ hộp**: Cài đặt → Vận chuyển.
6. **Thử trọn vòng trên khóa thử**: tạo một đơn Bán giao hàng → *Tạo vận đơn* → chọn dịch vụ. Dùng `POST /test/orders/<id>/advance` của Allingo (hoặc portal) đẩy vận đơn thử qua `picked_up`, `completed`; thử thêm một vận đơn hủy và một vận đơn `return_finished`. Kiểm: tồn trừ đúng một lần, đơn đổi trạng thái, webhook gửi lại không tạo dòng thời gian trùng.
7. **Chạy thật.** Sau khi Allingo duyệt app live: nạp ví Allingo, đổi `ALLINGO_APP_ID/SECRET` sang `app_live_.../sk_live_...`, đổi `ALLINGO_WEBHOOK_SECRET` sang secret của URL thật. Chưa duyệt thì khóa thật trả 403.

Chạy thử webhook không cần Allingo: `curl` tới `/api/webhooks/allingo` với chữ ký tính bằng `signAllingoPayload` (xem `packages/carriers/allingo/src/webhook.ts`).

## Mã nguồn

- `packages/carriers/allingo`: client (token cache, thử lại có backoff, rate limiter, khóa chống trùng), kiểu dữ liệu, kiểm chữ ký, ánh xạ trạng thái, `pnpm allingo:probe`.
- `packages/db`: `shipments`, `shipment_events`, `app_settings` (khóa `shipping`).
- `packages/sync/src/shipments.ts`: xử lý webhook đã lưu + quét bù; cập nhật đơn và tồn (có khóa trong câu UPDATE nên nút "Giao cho ĐVVC" tay và webhook cùng lúc chỉ trừ tồn một lần).
- `apps/api/src/shipping`: báo phí, tạo, hủy, in vận đơn, cài đặt; `apps/api/src/webhooks`: `POST /webhooks/allingo`.
- `apps/worker/src/shipping.ts`: job `webhooks` (mỗi phút) và `poll` (15 phút).
- Web: `components/shipping-panel.tsx` (thẻ vận chuyển + bảng giá trong chi tiết đơn), `settings/shipping`.

## Chưa biết, cần thử

- ~~Allingo có nhận địa chỉ chỉ có chữ~~: nhận (probe 23/11, khóa test), không cần tọa độ. Còn thử với địa chỉ thật trước khi chạy thật.
- AhaMove có bật cho tài khoản không (danh sách hãng của tài khoản test không có).
- Phí dùng Allingo, phí thu hộ COD, chu kỳ trả COD về tài khoản shop.
- Định dạng chính xác `status_event` trong webhook; mã xử lý đọc cả `data.object.status`/`delivery.status` nên vẫn chạy nếu thiếu.

## Giao diện đặt đơn giao hàng (3 cột)

Ở trang bán hàng, chế độ *Bán giao hàng*: khi đã có sản phẩm, khách hàng và đủ người nhận, SĐT, địa chỉ, phường, tỉnh thì cột thứ 3 trượt ra để chọn hãng.

- Giá lấy từ đơn nháp (`POST /shipping/quotes`), chưa tạo đơn. Gói hàng: cân nặng từ cấu hình sản phẩm (thiếu thì lấy mặc định), hộp nhỏ nhất đủ chứa, đổi được ở thẻ hãng.
- Hãng giao thường được chọn sẵn (cài đặt *Hãng chọn sẵn ở tab Giao thường*). Thẻ hãng hiện giá, thu hộ COD, người trả phí ("Cộng phí ship vào đơn"), và với hãng giao nhanh có hẹn giờ: giao ngay, sau 30 phút, sau 1 giờ, chọn giờ.
- Bấm X ở đầu thẻ để mở lại danh sách: tab *Giao thường* và *Giao nhanh*. Giao nhanh chia *Giao ngay*, *Giao trong 4 giờ*, *Giao trong ngày* (theo thời gian hãng báo, thiếu thì đoán từ tên dịch vụ), mọi hãng trộn chung; biểu tượng mũi tên đổi cách xếp giá / thời gian.
- **Xác nhận đặt đơn** ở cột 3: tạo đơn rồi đặt hãng; đơn nằm ở *Đang đóng gói* (chờ ship). Hãng báo đã lấy hàng (webhook) thì đơn sang *Đang giao* và trừ tồn; nút *Giao cho ĐVVC* vẫn bấm tay được. Hủy đơn lúc chưa giao thì hủy luôn lệnh lấy hàng ở hãng.
- Thẻ vận chuyển trong chi tiết đơn: *Cập nhật* (làm mới từ hãng), *Tìm tài xế ngay* (chuyến hẹn giờ: hủy rồi đặt lại ngay cùng dịch vụ), *Tìm lại* và *Chọn hãng khác* sau khi chuyến bị hủy.
- Hẹn giờ: Allingo dùng `fulfillment_type=scheduled` + `schedule_at`, AhaMove dùng `order_time`. Chưa kiểm với hãng thật, cần thử trên môi trường test.
- Dịch vụ AhaMove hiện trong bảng giá chọn ở Cài đặt → Vận chuyển (không tick = hiện hết, hoặc theo `AHAMOVE_SERVICES`).
- Logo hãng: đặt PNG vuông `apps/web/public/carriers/<mã hãng>.png`; thiếu thì hiện ô màu với chữ cái đầu.
