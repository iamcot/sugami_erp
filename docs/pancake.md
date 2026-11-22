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
- Chống vòng lặp: khi Sugami đẩy tồn lên Pancake, webhook `variations_warehouses` quay về sẽ được so với tồn Sugami; trùng thì bỏ qua.

## Ánh xạ

| Pancake | Sugami | Ghi chú |
|---------|--------|---------|
| `variation.display_id` | SKU | Khi nhập hàng từ KiotViet sang Pancake phải giữ mã hàng KiotViet (D10) |
| `variations_warehouses[].actual_remain_quantity` | tồn thực theo kho | `remain_quantity` là tồn có thể bán |
| `order.marketplace_id` | kênh | `-3` = Shopee (theo tài liệu). TikTok: xác nhận bằng `probe` |
| `invoice_info_list[].order_sn` | mã đơn sàn | |
| `fee_marketplace` | phí sàn | |
| `status` | trạng thái đơn | Bảng `ORDER_STATUS` trong `packages/channels/pancake/src/mapping.ts` |

Không đọc thông tin khách (tên, SĐT, địa chỉ) vào Sugami.

## Chưa kiểm chứng (cần dữ liệu thật)

1. Pancake có tự đẩy tồn lên Shopee/TikTok khi tồn đổi qua API không (thử với 1 SKU).
2. `marketplace_id` của TikTok.
3. `total_price` là tổng trước hay sau giảm giá; ý nghĩa đơn vị `start_time_update` (giây hay mili giây).
4. Dạng body của webhook `orders` (bọc trong `data` hay không).

## Thử trên iMac

```bash
# .env: PANCAKE_API_KEY, PANCAKE_SHOP_ID, PANCAKE_WEBHOOK_SECRET
pnpm --filter @sugami/channels-pancake build
pnpm --filter @sugami/channels-pancake probe
```

`probe` chỉ đọc, in số lượng sản phẩm/tồn, sàn đã nối và `marketplace_id`, đơn 7 ngày theo kênh và trạng thái; không in thông tin khách.
