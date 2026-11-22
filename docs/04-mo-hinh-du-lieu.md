# 4. Mô hình dữ liệu

Các bảng chính, nhóm theo module. Cơ sở dữ liệu: **MySQL 8.4**, InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`. Mọi bảng có `id` (UUID v7 lưu `BINARY(16)`, hoặc `BIGINT` tự tăng nếu muốn đơn giản), `created_at`, `updated_at`, `created_by`. Tiền lưu `BIGINT` theo đồng (VND không có số lẻ; CNY lưu theo xu), số lượng `DECIMAL(14,3)` để hỗ trợ đơn vị lẻ. Các cột ghi `jsonb` hay `text[]` bên dưới là kiểu `JSON` trong MySQL.

## 4.1 Sản phẩm (catalog)

```
category            (id, parent_id, name, slug, sort, external_ids jsonb)
brand               (id, name)
product             (id, code, name, category_id, brand_id, status[draft|active|archived],
                     description_base, attributes jsonb, unit, weight_g, dims_mm jsonb,
                     tags text[], origin, hs_note)   -- attributes đồ chơi: age_min, material, battery, cert_cr...
product_option      (id, product_id, name)            -- vd: Màu, Size
product_option_value(id, option_id, value, sort)
variant (SKU)       (id, product_id, sku UNIQUE, barcode, option_values jsonb,
                     price_retail, price_compare, cost_avg, weight_g,
                     min_stock, reorder_qty, status)
unit_conversion     (id, variant_id, unit, factor, barcode)   -- hộp = 12 cái
combo_item          (combo_variant_id, component_variant_id, qty)
price_list          (id, name, channel_id?, currency)
price_list_item     (price_list_id, variant_id, price, valid_from, valid_to)
```

## 4.2 Kho & xuất nhập tồn

```
warehouse           (id, code, name, address, type[store|warehouse|virtual],
                     kiotviet_branch_id)
location            (id, warehouse_id, code, name)            -- kệ/ô (tùy chọn)
stock_level         (warehouse_id, variant_id, on_hand, reserved, incoming,
                     available (cột generated: on_hand − reserved), updated_at)          -- bảng tổng hợp
stock_movement      (id, warehouse_id, variant_id, qty_delta, unit_cost,
                     type[purchase_in|sale_out|return_in|return_out|transfer_in|
                          transfer_out|adjust|count|combo_build|damage],
                     ref_type, ref_id, lot_id?, occurred_at, note)   -- SỔ KHO, append-only
lot                 (id, variant_id, lot_no, expiry_date, received_at, unit_cost)
stock_document      (id, code, type[receipt|issue|transfer|adjustment|count],
                     status[draft|confirmed|cancelled], warehouse_id, to_warehouse_id?,
                     reason, synced_to_kiotviet_at, external_id)
stock_document_line (id, document_id, variant_id, qty, unit_cost, lot_id?)
stock_count_session (id, warehouse_id, status, started_at, finished_at, scope jsonb)
stock_count_line    (session_id, variant_id, expected_qty, counted_qty, counted_by)
```

**Quy tắc sổ kho:**

- `stock_level.on_hand = SUM(stock_movement.qty_delta)` theo kho + SKU; bảng tổng hợp cập nhật trong cùng transaction với movement.
- Chỉ phiếu đã xác nhận mới sinh movement. Hủy phiếu sinh movement đảo ngược, không xóa.
- Giá vốn bình quân gia quyền cập nhật khi nhập: `cost_new = (on_hand*cost_old + qty*unit_cost) / (on_hand+qty)`. Tùy chọn FIFO theo lô cho hàng có hạn dùng.
- Báo cáo xuất nhập tồn kỳ = tồn đầu + tổng nhập − tổng xuất = tồn cuối, tính từ ledger.
- Khi KiotViet là master tồn (GĐ1–2): biến động từ KiotViet (bán, nhập trên KV) được ghi thành movement có `ref_type='kiotviet_sync'`; chênh lệch khi reconcile ghi `type='adjust'` và đưa lên màn hình cảnh báo.

## 4.3 Nguồn hàng (sourcing)

```
supplier            (id, code, name, contact jsonb, platform[1688|taobao|local|factory|other],
                     payment_terms, lead_time_days, rating, note, kiotviet_supplier_id)
supplier_product    (supplier_id, variant_id, supplier_sku, supplier_url, moq,
                     last_price, currency, last_quoted_at)
quotation           (id, supplier_id, valid_to, currency, status, file_ids)
purchase_order      (id, code, supplier_id, warehouse_id,
                     status[draft|sent|confirmed|partially_received|received|cancelled],
                     currency, fx_rate, shipping_cost, other_cost, expected_at, paid_amount)
purchase_order_line (id, po_id, variant_id, qty, unit_price, received_qty)
landed_cost         (id, po_id, type[ship_cn|ship_vn|tax|service], amount, allocation[by_value|by_qty|by_weight])
supplier_payment    (id, supplier_id, po_id?, amount, method, paid_at, note)
forwarder           (id, name, contact, pricing jsonb)       -- đơn vị vận chuyển trung gian TQ–VN
                                                             -- pricing: giá/kg, giá/m³, phí mua hộ %, phí kiểm đếm, gỗ...
fx_rate             (date, currency, rate)                   -- tỷ giá CNY/VND dùng khi tính giá vốn
inbound_parcel      (id, forwarder_id, po_id?, cn_tracking_no, parcel_code,
                     weight_kg, volume_m3, chargeable_basis[kg|m3],
                     status[ordered|shipped_cn|at_cn_warehouse|in_transit|arrived_vn|received|lost],
                     ship_fee_vnd, extra_fees jsonb, shipped_at, arrived_at)
inbound_parcel_line (parcel_id, po_line_id, qty)             -- một PO có thể về nhiều kiện, một kiện chứa nhiều PO
```

Với đồ chơi nhập Taobao/1688: giá vốn VND = giá CNY × tỷ giá + phí mua hộ + ship nội địa TQ + phí trung gian (phân bổ theo cân nặng hoặc khối của kiện) + ship VN. Nhận kiện tạo `stock_document(type=receipt)` → movement `purchase_in` với `unit_cost` đã phân bổ landed cost → đẩy phiếu nhập sang KiotViet.

## 4.4 Kênh bán & đơn hàng

```
channel             (id, type[kiotviet|shopee|tiktok|lazada|facebook|zalo|website|store],
                     name, shop_external_id, credentials_enc, settings jsonb, status)
channel_listing     (id, channel_id, variant_id, external_product_id, external_sku_id,
                     title, status, last_synced_at, sync_error)
order               (id, code, channel_id, external_code, kiotviet_order_id, kiotviet_invoice_id,
                     customer_id, status[new|confirmed|packing|shipped|delivered|completed|
                                    cancelled|returned],
                     payment_status, subtotal, discount, shipping_fee, platform_fee,
                     total, cod_amount, ordered_at, warehouse_id, internal_note, tags)
order_line          (id, order_id, variant_id, sku_snapshot, name_snapshot, qty,
                     unit_price, discount, cost_snapshot)
shipment            (id, order_id, carrier, tracking_no, status, fee, packed_by, packed_at)
return_request      (id, order_id, reason, status, refund_amount, restock bool)
customer            (id, name, phone, email, address jsonb, kiotviet_customer_id, tags)
```

## 4.5 Media & content

```
media_asset         (id, kind[image|video|file], storage_key, mime, width, height,
                     size_bytes, checksum, alt, tags text[], source, uploaded_by)
media_variant       (asset_id, preset[thumb|square_1000|shopee_main|tiktok_main|webp_1600],
                     storage_key)
product_media       (product_id, variant_id?, asset_id, role[main|gallery|size_chart|video],
                     sort, channel_id?)    -- channel_id null = dùng chung
content_template    (id, name, channel_type, body_template)   -- khung mô tả theo sàn
product_content     (id, product_id, channel_id?, title, short_desc, long_desc,
                     bullet_points jsonb, seo_keywords text[], status[draft|review|approved],
                     version)
content_post        (id, channel_type[facebook|tiktok|zalo|instagram], caption, asset_ids,
                     product_ids, scheduled_at, status[idea|draft|scheduled|published], owner)
```

## 4.6 Đồng bộ & hệ thống

```
sync_connection     (id, provider, account_name, secret_enc, status, settings jsonb)
sync_cursor         (connection_id, resource, last_modified_from, last_run_at, state jsonb)
external_ref        (entity_type, entity_id, provider, external_id, external_code, hash)
webhook_event       (id, provider, event_type, delivery_id UNIQUE, headers, body,
                     received_at, processed_at, error)
outbox              (id, provider, action, payload, status, attempts, next_attempt_at,
                     idempotency_key UNIQUE, last_error)
sync_issue          (id, kind[stock_mismatch|sku_missing|sku_duplicate|push_failed], entity, detail, resolved_at)
audit_log           (id, user_id, action, entity_type, entity_id, diff jsonb, at)
user / role / permission / user_warehouse
```

## 4.7 Quan hệ chính

- `product 1–n variant`; `variant` là đơn vị của kho, giá, đơn hàng, listing.
- `variant n–n warehouse` qua `stock_level` và `stock_movement`.
- `variant n–n supplier` qua `supplier_product`.
- `variant n–n channel` qua `channel_listing`.
- `product n–n media_asset` qua `product_media`.
- Mọi bản ghi ánh xạ sang hệ thống ngoài qua `external_ref` (không rải cột `kiotviet_id` khắp nơi, trừ vài khóa hay dùng).
