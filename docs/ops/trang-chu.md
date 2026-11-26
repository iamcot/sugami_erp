# Trang chủ sugami.vn

Trang giới thiệu tĩnh nằm ở `sites/sugami.vn/`. Trên iMac, dịch vụ `homepage` trong `docker-compose.yml` (nginx) phục vụ thư mục này ở `http://localhost:8080`, Cloudflare Tunnel đưa ra internet.

## Bật lần đầu (chủ shop làm)

1. Trên iMac, cập nhật code rồi bật dịch vụ:
   ```bash
   cd ~/sugami_erp && git pull
   docker compose up -d homepage
   ```
   Mở `http://localhost:8080` trên iMac để chắc trang đã chạy.
2. Vào Cloudflare: **Zero Trust → Networks → Tunnels**, chọn tunnel đang dùng cho `erp.sugami.vn` → **Public Hostname → Add a public hostname**:
   - Subdomain để trống, Domain `sugami.vn`, Service `HTTP` · `localhost:8080`.
   - Thêm một dòng nữa: Subdomain `www`, Domain `sugami.vn`, Service `HTTP` · `localhost:8080`.
3. Nếu Cloudflare báo đã có bản ghi DNS `sugami.vn` hoặc `www` (A/CNAME cũ trỏ về hosting khác), vào **DNS → Records** xóa bản ghi cũ đó rồi lưu lại hostname ở bước 2. Đừng đụng bản ghi MX/TXT của email.
4. Mở `https://sugami.vn` từ điện thoại (tắt wifi) để kiểm tra.

Nếu tunnel chạy bằng file `config.yml` thay vì dashboard, thêm vào `ingress` (trước dòng `http_status:404`):
```yaml
  - hostname: sugami.vn
    service: http://localhost:8080
  - hostname: www.sugami.vn
    service: http://localhost:8080
```
rồi `sudo launchctl kickstart -k system/com.cloudflare.cloudflared` (hoặc khởi động lại cloudflared).

## Cập nhật nội dung

Chỉ cần `git pull` (hoặc `bash scripts/update.sh`), nginx đọc thẳng thư mục nên không cần khởi động lại. Thư mục `concepts/`, `tools/` và `README.md` không công khai.
