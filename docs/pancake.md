# Pancake POS (lớp trung gian tới Shopee/TikTok)

Đang **dùng thử 15 ngày** (từ 2026-11-22, 200k/tháng, Pancake là đối tác TikTok). Mục tiêu: Pancake thay KiotViet làm hệ thống duy nhất đẩy tồn lên sàn; Sugami trao đổi với Pancake qua Open API + webhook thay cho file Excel.

Tài liệu API: https://pos.pancake.vn/developers/api/en — API thật ở `https://pos.pages.fm/api/v1`, xác thực bằng query `api_key`.

## Luồng dữ liệu

```
Shopee / TikTok ⇄ Pancake POS ⇄ Sugami
                    │  webhook (orders, products, variations_warehouses) → POST hooks.sugami.vn/api/webhooks/pancake
                    │  REST GET (quét bù theo updated_at)               ← worker
                    └─ REST POST tồn (sau khi thử xong, P4-P3)          ← outbox
```

- Webhook không có chữ ký. Sugami kiểm header bí mật `x-sugami-secret` (giá trị = `PANCAKE_WEBHOOK_SECRET`, nhập ở `webhook_headers` của Pancake), lưu vào `webhook_events`, trả 200 ngay. Pancake chỉ gửi lại 2 lần (sau 10 và 30 phút) nên worker vẫn quét bù định kỳ bằng `updateStatus=updated_at`.
- Webhook không có mã lần gửi: Sugami dùng SHA-256 của body làm `delivery_id` để không lưu trùng.
- Máy tắt hoặc dịch vụ chết: xem [3.8](03-kien-truc.md#38-khi-máy-tắt-hoặc-dịch-vụ-chết). Tóm tắt: quét bù theo con trỏ khi worker khởi động và mỗi 5 phút; chỉ đẩy tồn sau khi đã kéo hết đơn bị lỡ.
- Chống vòng lặp: khi Sugami đẩy tồn lên Pancake, webhook `variations_warehouses` quay về sẽ được so với tồn Sugami; trùng thì bỏ qua.

## Ánh xạ

| Pancake | Sugami | Ghi chú |
|---------|--------|---------|
| `variation.display_id` | SKU | Khi nhập hàng từ KiotViet sang Pancake phải giữ mã hàng KiotViet (D10) |
| `variations_warehouses[].actual_remain_quantity` | tồn thực theo kho | `remain_quantity` là tồn có thể bán |
| `order.marketplace_id` | kênh | `-3` = Shopee (cả 3 shop VN, MY, PH dùng chung). `-9` = TikTok (suy ra từ `probe` sau khi nối TikTok, chờ xác nhận bằng đơn thật) |
| `invoice_info_list[].order_sn` | mã đơn sàn | |
| `fee_marketplace` | phí sàn | |
| `status` | trạng thái đơn | Bảng `ORDER_STATUS` trong `packages/channels/pancake/src/mapping.ts` |

Từ đơn chỉ đọc tên người mua (nickname Shopee, bỏ qua nếu bị che) và SĐT nếu không bị che; không đọc địa chỉ. Khách khóa theo `kênh:nickname` (`customers.external_key`).

## Tài khoản sàn đã nối (2026-11-22)

Tên gợi nhớ đặt trong Pancake (Cài đặt → Danh sách kênh bán); Sugami dùng đúng tên này làm tên kênh.

| Tên gợi nhớ | ID tài khoản | Sàn | `marketplace_id` | Tiền tệ |
|-------------|--------------|-----|------------------|---------|
| SuGaMi Shopee | 6875667 | Shopee VN | -3 | VND |
| SuGaMi Shopee MY | 1841375951 | Shopee MY | -3 | MYR |
| SuGaMi Shopee PH | 1841375952 | Shopee PH | -3 | PHP |
| SuGaMi Tiktok | 7494949569066076732 | TikTok Shop | -9 (tạm) | VND |

Ba shop Shopee dùng chung `marketplace_id` -3, nên phân biệt đơn theo ID tài khoản, không theo `marketplace_id`. Cần một đơn thật để xác nhận đơn Pancake mang ID tài khoản nào.

## Đẩy sản phẩm và tồn từ Sugami sang Pancake (bản thử)

Trang chi tiết sản phẩm có nút **Pancake**, làm từng sản phẩm một, luôn xem trước rồi mới ghi:

- **Tạo sản phẩm**: `POST /shops/{id}/products` với `custom_id` = mã sản phẩm / SKU Sugami, giá bán, giá vốn, phân loại, tồn Sugami vào kho đã chọn. Từ chối nếu SKU đã có trên Pancake (không tạo trùng); sau khi tạo, Sugami đọc lại để xác nhận vì Pancake không trả về id.
- **Đồng bộ tồn**: `POST /shops/{id}/variations/update_quantity` với `is_actual_remain_quantity: true` (tồn thực, không phải tồn có thể bán), rồi đọc lại tồn để báo trước/sau.
- Kho Pancake: lấy từ `GET /warehouses`; nếu shop có nhiều kho thì chọn trong giao diện hoặc đặt `PANCAKE_WAREHOUSE_ID`.
- API: `POST /api/pancake/products/:code/push` và `/stock` (`{"dryRun": true}` mặc định).
- **Liên kết với listing Shopee/TikTok không có trong API công khai** (chỉ đọc được `linked_variation_custom_id`): sau khi tạo, liên kết bằng tay trên Pancake, rồi đổi tồn và xem sàn cập nhật sau bao lâu.
- Chưa kiểm chứng với shop thật: các trường bắt buộc của `product`, Pancake khớp listing theo `custom_id` hay `display_id`, đơn vị `weight` (không gửi).

## Chưa kiểm chứng (cần dữ liệu thật)

1. Pancake có tự đẩy tồn lên Shopee/TikTok khi tồn đổi qua API không (thử với 1 SKU).
2. `marketplace_id` của TikTok: tạm là `-9`, cần một đơn TikTok thật để xác nhận.
3. `total_price` là tổng trước hay sau giảm giá; ý nghĩa đơn vị `start_time_update` (giây hay mili giây).
4. Dạng body của webhook `orders` (bọc trong `data` hay không).

## Thử trên iMac

```bash
# .env: PANCAKE_API_KEY, PANCAKE_SHOP_ID, PANCAKE_WEBHOOK_SECRET
pnpm pancake:probe
```

`probe` chỉ đọc, in số lượng sản phẩm/tồn, sàn đã nối và `marketplace_id`, đơn 7 ngày theo kênh và trạng thái; không in thông tin khách.

## Thông tin đơn lấy từ Pancake (bổ sung)

- Khách: nickname Shopee ở `customer.username` (`bill_full_name` và SĐT bị che nên bỏ qua).
- Lưu vào đơn: hạn bàn giao (`additional_info.ship_by_date`, dự phòng `delivery_deadline`), địa chỉ nhận (`shipping_address.full_address`, tỉnh), phí sàn (`fee_marketplace`) và chi tiết (`advanced_platform_fee`, chỉ các mục số khác 0). Đơn nhập từ KiotViet được bổ sung các trường này nhưng giữ trạng thái/tồn.
- Dòng hàng không có mã (tin đăng chưa nối sản phẩm Pancake) được đếm ở "Dòng hàng chưa liên kết" và không trừ tồn; cần nối tin đăng với sản phẩm trong Pancake.
- Chạy lại "Quét lại" sau khi cập nhật để đơn cũ nhận thông tin mới.

## Nạp lại lịch sử đơn (backfill)

- Tab "Đơn từ Pancake": đặt "Số ngày quét lùi" tới 1500 ngày, tick "Quét lại", bấm "Xem trước" rồi chạy thật. Quét dài được chia từng cửa sổ 30 ngày để không quá tải; chạy lại nhiều lần không tạo trùng.
- Đơn cũ bán trước lần nhập tồn đầu của SKU thì không trừ tồn (cùng quy tắc nhập KiotViet); đơn trùng mã sàn với hóa đơn KiotViet chỉ được bổ sung thông tin (ĐVVC, địa chỉ, phí sàn, khách), giữ trạng thái và tồn của KiotViet.
- Có thể chọn **Khoảng ngày** (từ ngày – đến ngày, giờ Việt Nam) thay vì lùi từ hiện tại, để nạp đúng giai đoạn Pancake đã kéo từ sàn; chạy khoảng ngày không đổi con trỏ đồng bộ hằng ngày.
- Giới hạn: Pancake chỉ có đơn từ lúc shop nối sàn vào Pancake.

## Ảnh sản phẩm từ tin đăng sàn

- Pancake giữ các tin đăng Shopee/TikTok (`GET /marketplace/products`): mỗi tin có `variations[]` với `sku`, `images`, `price`, `quantity`.
- Tab "Đơn từ Pancake" → "Ảnh sản phẩm từ sàn": nối ảnh vào biến thể theo SKU người bán (= mã hàng KiotViet). Ưu tiên shop Việt Nam (bỏ qua hậu tố PH/MY khi trùng SKU). Mặc định chỉ điền cho biến thể chưa có ảnh; tick "Thay cả ảnh đã có" để ghi đè ảnh từ file KiotViet.
- Bước 2: nút "Lưu ảnh về kho (S3)" (`POST /api/media/mirror-variant-images`) tải ảnh từ URL gốc (chỉ https, host công khai, tối đa 20 MB, tối đa 6 ảnh/biến thể) vào lớp `storage` (S3, prefix `sugami/`), tạo `media_assets` + `product_media`. Cùng một file dùng cho nhiều biến thể chỉ lưu một lần (SHA-256). Làm theo lô 40 biến thể, chạy lại an toàn; biến thể đã có ảnh trong kho thì bỏ qua. Giao diện ưu tiên ảnh trong kho, chưa có thì dùng URL gốc.

## Mã sàn ↔ mã Sugami (học từ đơn)

- Dòng đơn Pancake chưa liên kết sản phẩm chỉ có tên bắt đầu bằng mã của sàn (`207086204498 - …`). Khi cùng một đơn có ở KiotViet (dòng đã biết mã hàng) và ở Pancake, Sugami ghép hai phía: một dòng mỗi bên thì chắc chắn; nhiều dòng thì chỉ ghép khi số lượng là duy nhất, còn lại tính là "chưa chắc".
- Lưu ở `external_refs` (provider `pancake_sku`, entity `variant`). Đơn mới có mã đó được gán đúng mã hàng (trừ tồn đúng SKU); ảnh sản phẩm từ tin đăng cũng dùng bảng này.
- Mã đã map sang biến thể khác thì giữ mã đầu tiên và tính là "mâu thuẫn".

## Mã đơn sàn trên đơn Pancake

- Đơn Shopee/TikTok trong Pancake có `display_id` chính là mã đơn sàn (ví dụ `2611220ND1CP8V`, mã Pancake `PC2611220ND1CP8V`); `invoice_info_list[].order_sn` thường trống. Sugami dùng `order_sn` nếu có, không thì dùng `display_id` của đơn từ sàn (chuỗi có chữ hoặc từ 12 ký tự; đơn tạo trong Pancake có số nhỏ nên bị loại).
- Nhờ vậy đơn Pancake nối được với hóa đơn KiotViet (`HDSPE_…`) cùng mã đơn sàn. Đơn Pancake đã tạo trước đó thành bản trùng sẽ được gộp: bản Pancake bị xóa, tồn đã trừ được hoàn lại, bản KiotViet được giữ và bổ sung ĐVVC, địa chỉ, phí sàn.

## Tin đăng trên sàn (channel_listings)

- Bảng `channel_listings` (tin đăng: shop, tiêu đề, SKU, giá, ảnh) và `channel_listing_variants` (biến thể của tin: SKU sàn, giá, tồn, ảnh, biến thể Sugami đã nối và cách nối). Chỉ là bản sao đọc từ Pancake (`GET /marketplace/products`), chạy lại thì cập nhật tại chỗ. Khóa tin đăng gồm tên shop vì shop VN/MY/PH dùng chung `marketplace_id`.
- Nối biến thể sàn với biến thể Sugami, theo thứ tự: link trên Pancake (`linked_variation_custom_id`), SKU sàn = mã hàng, SKU sàn = mã vạch, mã học từ đơn (`pancake_sku`).
- Giao diện: mục "Tin đăng sàn" (lọc đã nối/một phần/chưa nối, theo shop, tìm theo tên/SKU), drawer chi tiết tin, và thẻ "Đang đăng trên sàn" ở chi tiết sản phẩm. Nút "Đồng bộ tin đăng" ở tab "Đơn từ Pancake".

## Ghép tay dòng hàng chưa liên kết

Dòng đơn Pancake chưa nối sản phẩm chỉ có tên bắt đầu bằng mã sàn. Mục "Dòng hàng chưa liên kết" ở trang Dữ liệu Pancake gom theo mã sàn; chọn một mã hàng Sugami có sẵn thì lưu `external_refs` (provider `pancake_sku`), gán SKU cho mọi dòng đang chưa link và trừ tồn theo quy tắc thường (đơn đang hoạt động và sau mốc tồn đầu của mã hàng). Các lần đồng bộ sau tự áp mã đã ghép. Không phụ thuộc việc link trên Pancake; chỉ ghép vào sản phẩm đã có, không tạo sản phẩm mới.
API: `GET /pancake/unlinked-lines`, `GET /pancake/variant-search?q=`, `POST /pancake/link-line {key, variantId}`.

## Tên biến thể trên dòng đơn

Dòng đơn chưa liên kết ("Thêm nhanh") chỉ có tiêu đề sàn trong `variation_info.name`, còn tùy chọn (ví dụ "Xanh đen đậm") Pancake để riêng. `lineName()` (`packages/channels/pancake/src/mapping.ts`) đọc `variation_info.fields[].value` và nối vào cuối tên (`… - Xanh đen đậm`) nếu tên chưa có. Lần đồng bộ/quét lại sau đó cập nhật tên các dòng đã lưu (không đụng tồn). Cấu trúc `fields` dựa trên định dạng tùy chọn của Pancake, chưa kiểm với dữ liệu thật: chạy `pnpm pancake:probe` xem `items[].variation_info` nếu tên biến thể vẫn chưa hiện.

## Liên kết sàn trên trang Sản phẩm

Mọi thứ nằm ở trang Sản phẩm (không còn trang Tin đăng sàn riêng). Mỗi sản phẩm hiện 3 nhãn Pancake / Shopee / TikTok dạng `đã kết nối/tổng biến thể`:
- Pancake: số biến thể (theo SKU) có trên Pancake, lưu thành `external_refs` (provider `pancake`) khi đồng bộ.
- Shopee/TikTok: số biến thể được Pancake liên kết (`linked_variation_custom_id`) với tin đăng sàn. Sugami không tự nối (không đoán theo SKU/mã vạch/đơn) và không có nối tay; muốn nối thì làm trong Pancake rồi bấm lại "Đồng bộ từ Pancake".
- Nút "Đồng bộ từ Pancake" kéo cả sản phẩm Pancake lẫn tin đăng sàn; nút "Tin đăng sàn" mở drawer xem tin đăng, lọc theo nền tảng và trạng thái nối.
Pancake chỉ đẩy tồn lên tin đăng đã được liên kết trong chính Pancake (API công khai không có lệnh tạo liên kết).

## Tự đẩy tồn lên Pancake (P4-P3)

- Cài đặt → "Đẩy tồn lên Pancake": nút Bật/Tạm tắt (mặc định tắt). Bật = worker mỗi 2 phút đẩy các mã có tồn bán được đổi so với lần đẩy trước. Tạm tắt không mất gì: bật lại thì đẩy phần đã đổi trong lúc tắt.
- Tồn bán được = tồn kho Sugami (kho `PANCAKE_SYNC_WAREHOUSE`) trừ hàng đang giữ cho đơn giao ở trang Bán hàng, không âm. Số đã đẩy lần cuối lưu ở `external_refs.hash` của biến thể Pancake.
- Chỉ đẩy khi con trỏ đơn Pancake (`pancake:orders`) mới hơn 20 phút, để không ghi đè tồn Pancake bằng số chưa trừ các đơn Pancake đã nhận.
- Lần đầu: "Xem chênh lệch" rồi "Đặt tồn Pancake theo Sugami" (đồng bộ cả cửa hàng và ghi nhớ số đã đẩy), sau đó mới bật tự động. Chỉ một nơi đẩy tồn lên sàn: tắt đồng bộ tồn bên KiotViet trước.

## Chat Shopee (menu Chat, chỉ đọc)

Chat nằm ở **Pages API** (`https://pages.fm/api/public_api/v1/pages/<page_id>/...`), khác API POS: dùng *page access token* tạo ở Pancake → trang Shopee → Cài đặt → Công cụ, không dùng API key POS (key POS bị từ chối ở đây). Page id của trang Shopee có dạng `spo_<số>` (khác shop id POS).

Đã kiểm chứng ngày 2026-11-23 trên trang Shopee SuGaMi (chỉ đọc):

- `GET /conversations` (bắt buộc `page_id`, `since`, `until` cách nhau tối đa 1 tháng, `page_number`) trả hội thoại loại `INBOX` (chat) và `RATING` (đánh giá sao, tin là `[5⭐]`), có `seen`, `snippet`, `tags`, `last_sent_by`. Thời gian là UTC không có múi giờ.
- `GET /conversations/<id>/messages` trả 20 tin mới nhất, `current_count` để lấy tin cũ hơn. Người gửi là shop khi `from.id` trùng page id. Nội dung là HTML nhỏ; có tin tự động của Shopee (`shopee_faq_messages`).
- Tài liệu không ghi giới hạn tần suất; 40 lần gọi liên tiếp không bị chặn. Client tự giới hạn 2 lần/giây.
- **Webhook có**, nhưng bật cho một trang tính **2 trang** trong gói cước (gói Standard chỉ 3 trang) nên **không dùng**: Sugami đọc theo yêu cầu khi mở menu Chat (cache 20 giây).
- Trả lời khách: `POST /pages/<page_id>/conversations/<id>/messages` với `{action: "reply_inbox", message}`. Tài liệu Pancake ghi endpoint này ở `pages.fm/api/v1` dùng *user* access_token; Sugami thử dùng đường `public_api/v1` với page token cho thống nhất, **đã kiểm chứng 2026-11-23: gửi được tin tới Shopee**. Không tự thử lại khi lỗi để khách không nhận trùng tin.
- Chưa thử: ảnh trong chat, cửa sổ thời gian được phép trả lời của Shopee, token còn dùng được sau khi hết dùng thử không.

Cấu hình trong `.env` (không commit): `PANCAKE_CHAT_PAGE_ID` + `PANCAKE_CHAT_TOKEN` cho một trang, hoặc `PANCAKE_CHAT_PAGES=spo_123=tokenA;facebook:sugami.vn=tokenB` cho nhiều kênh (id không lộ kênh thì viết `kênh:id`) (Shopee, TikTok, Facebook...). Kênh suy ra từ tiền tố page id: `spo_` Shopee, số thuần Facebook, `wa_` WhatsApp, `tts_` TikTok (chủ shop xác nhận). Trang `/chat` có chip lọc theo kênh (icon kênh), tự tải lại mỗi 60 giây khi tab đang mở; một trang lỗi (token hết hạn) không làm mất các kênh còn lại. Mã: `packages/channels/pancake/src/chat.ts`, API `GET /chat/conversations`, `GET /chat/conversations/:id/messages` (quyền `orders.read`), ô trả lời (gửi ngay, không hỏi xác nhận; chỉ cho chat, quyền `orders.write`, `POST /chat/conversations/:id/messages`), trang `/chat` với bộ lọc loại, chưa đọc, chờ trả lời, khoảng ngày, tìm theo tên/nội dung.

### Báo tin nhắn mới khi đóng app (worker)

Tự tải lại 60 giây chỉ chạy khi đang mở trang. Để báo cả khi đóng app, **worker** quét chat mỗi 2 phút (cùng cấu hình `PANCAKE_CHAT_PAGES`, tắt bằng `PANCAKE_CHAT_SYNC=off`), đọc 7 ngày gần nhất của mọi trang và ghi trạng thái vào bảng `chat_conversations` (cần `pnpm db:deploy`). Pancake vẫn giữ tin nhắn; Sugami chỉ nhớ ai đang chờ trả lời.

- **Tin mới:** khi khách là người nhắn cuối và chưa từng báo, ghi một dòng vào chuông (`chat_new`) và gửi push PWA tới người có quyền `orders.read`, bấm vào mở `/chat?c=<id>`. Quá 3 chat mới trong một lượt thì gộp một push. Lần quét đầu tiên và tin cũ hơn 6 giờ không báo, tránh dồn thông báo cũ.
- **Cần xem:** chat mà khách nhắn cuối và chưa ai bấm **Đã kiểm tra**. Số này hiện trên menu Chat (`GET /chat/counts`, đọc từ bảng, không gọi Pancake) và có chip lọc "Cần xem" trên trang. Shop trả lời (từ Sugami, Pancake hay sàn) thì tự hết.
- **Đã kiểm tra** (từng khách, `POST /chat/conversations/:id/review`): tắt cảnh báo của chat đó cho tới khi khách nhắn tiếp sau thời điểm bấm; khách nhắn lại thì cảnh báo bật lại và báo mới.
- Chỉ tính chat, không tính đánh giá sao.
