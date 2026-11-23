# Webhook từ ĐVVC về máy: ngrok (dev) và Cloudflare Tunnel (iMac)

Allingo và AhaMove báo trạng thái vận đơn bằng webhook, nên máy chạy API phải có địa chỉ HTTPS công khai.
API lắng nghe cổng `4000`, tiền tố `/api`.

| Hãng | Đường dẫn | Xác thực | Biến `.env` |
|---|---|---|---|
| Allingo | `POST /api/webhooks/allingo` | Chữ ký HMAC trong header `X-AllinGo-Signature` | `ALLINGO_WEBHOOK_SECRET` (portal hiện một lần khi tạo webhook) |
| AhaMove | `POST /api/webhooks/ahamove` | Header `apikey` hoặc `Authorization: Bearer` phải bằng secret mình đặt | `AHAMOVE_WEBHOOK_SECRET` (tự đặt chuỗi dài ngẫu nhiên) |

Chưa đặt secret thì route trả 503; sai secret trả 403.

## A. Máy dev: ngrok

1. Cài và đăng nhập: `brew install ngrok`, rồi `ngrok config add-authtoken <token>` (token ở dashboard ngrok).
2. Nên lấy **domain tĩnh miễn phí** của tài khoản ngrok (Dashboard, Domains) để địa chỉ không đổi mỗi lần chạy lại.
3. Chạy: `ngrok http --url=<domain-tĩnh>.ngrok-free.app 4000` (không dùng domain tĩnh thì bỏ `--url=...`, mỗi lần chạy sẽ ra địa chỉ mới và phải cập nhật lại ở hai portal).
4. Địa chỉ webhook:
   - Allingo: `https://<domain>/api/webhooks/allingo`
   - AhaMove: `https://<domain>/api/webhooks/ahamove`
5. Đặt secret vào `.env`, rồi restart API: `ALLINGO_WEBHOOK_SECRET=...`, `AHAMOVE_WEBHOOK_SECRET=...`.
6. Allingo: trong portal, mục webhook của app **thử** (khóa thử và khóa thật có URL và secret riêng), dán URL, chép secret hiện ra vào `.env`.
7. AhaMove: gửi URL và secret cho AhaMove (cấu hình webhook của tài khoản/ứng dụng đối tác, thử trước với `AHAMOVE_ENV=stg`). Chỗ nhập chính xác có thể do bộ phận hỗ trợ của họ làm hộ; **chưa kiểm chứng** trên staging.
8. Kiểm tra: mở `http://127.0.0.1:4040` (giao diện ngrok) để xem từng request vào, có thể bấm Replay.
   - Thử nhanh không cần hãng: `curl -i -X POST https://<domain>/api/webhooks/ahamove -H 'apikey: <secret>' -H 'content-type: application/json' -d '{"_id":"test","status":"ASSIGNING"}'` phải trả `200`; bỏ header phải trả `403`.
   - Allingo: dùng `POST /test/orders/<id>/advance` của Allingo đẩy vận đơn thử qua các trạng thái (xem `docs/allingo.md`).

Lưu ý: URL ngrok chỉ chạy khi máy dev và lệnh `ngrok` đang bật; khi sang iMac thì đổi URL ở hai portal sang `hooks.sugami.vn`.

## B. iMac: Cloudflare Tunnel

Giao diện `erp.sugami.vn` về cổng 3000, webhook `hooks.sugami.vn` về cổng 4000. Domain `sugami.vn` phải dùng DNS của Cloudflare.

1. Cài: `brew install cloudflared`, đăng nhập `cloudflared tunnel login` (chọn zone `sugami.vn`).
2. Tạo tunnel: `cloudflared tunnel create sugami` (ghi lại ID tunnel, file credentials nằm ở `~/.cloudflared/<ID>.json`).
3. Trỏ DNS:
   - `cloudflared tunnel route dns sugami erp.sugami.vn`
   - `cloudflared tunnel route dns sugami hooks.sugami.vn`
4. Tạo `~/.cloudflared/config.yml`:

   ```yaml
   tunnel: <ID>
   credentials-file: /Users/<tên-user>/.cloudflared/<ID>.json
   ingress:
     # Chỉ cho webhook đi qua hooks.sugami.vn, không lộ phần còn lại của API
     - hostname: hooks.sugami.vn
       path: ^/api/webhooks/
       service: http://localhost:4000
     - hostname: hooks.sugami.vn
       service: http_status:404
     - hostname: erp.sugami.vn
       service: http://localhost:3000
     - service: http_status:404
   ```

   Nếu giao diện web gọi API qua cùng host `erp.sugami.vn` bằng đường `/api`, dùng cấu hình proxy hiện có của web (đừng mở thêm cổng 4000 ra `erp.sugami.vn`).
5. Kiểm: `cloudflared tunnel ingress validate`, rồi chạy thử `cloudflared tunnel run sugami`.
6. Chạy nền, tự bật khi khởi động máy: `sudo cloudflared service install` (macOS tạo LaunchDaemon). Cũng nên tắt chế độ ngủ của iMac (System Settings, Energy).
7. Địa chỉ webhook thật: `https://hooks.sugami.vn/api/webhooks/allingo` và `https://hooks.sugami.vn/api/webhooks/ahamove`. Allingo dùng secret của app **thật**; đổi `ALLINGO_WEBHOOK_SECRET` cùng lúc.
8. Kiểm từ 4G: gọi lệnh `curl` ở mục A với `hooks.sugami.vn`.

## Sự cố thường gặp

- `403`: secret ở portal khác `.env`, hoặc đang dùng secret của khóa thử cho URL thật (và ngược lại).
- `503`: chưa đặt biến secret hoặc chưa restart API.
- `502` từ ngrok/Cloudflare: API chưa chạy ở cổng 4000.
- Hãng không thấy phản hồi: kiểm tra Replay trong ngrok; Allingo gửi lại cùng một id nên không tạo trùng, AhaMove gửi lại nội dung giống hệt cũng chỉ lưu một lần.
