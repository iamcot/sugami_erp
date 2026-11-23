#!/usr/bin/env bash
# Sao lưu DB MySQL: file .sql.gz vào BACKUP_DIR (mặc định ~/sugami-backups), giữ BACKUP_KEEP_DAYS ngày (mặc định 14).
# Có S3_BUCKET thì đẩy thêm lên S3 (<S3_PREFIX>backups/), cần đã build gói storage (scripts/update.sh làm sẵn). Chạy tay: bash scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

DIR="${BACKUP_DIR:-$HOME/sugami-backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"

# DATABASE_URL=mysql://user:pass@host:port/db -> biến riêng (mật khẩu qua MYSQL_PWD, không lộ trên dòng lệnh)
eval "$(node -e '
const u = new URL(process.env.DATABASE_URL);
const q = (s) => "\x27" + s.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
console.log(`DB_USER=${q(decodeURIComponent(u.username))} DB_PASS=${q(decodeURIComponent(u.password))} DB_HOST=${q(u.hostname)} DB_PORT=${q(u.port || "3306")} DB_NAME=${q(u.pathname.slice(1))}`);
')"

OUT="$DIR/sugami-$(date +%Y%m%d-%H%M%S).sql.gz"
MYSQL_PWD="$DB_PASS" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --routines --no-tablespaces --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
# file rỗng/quá nhỏ = dump hỏng
[ "$(wc -c < "$OUT")" -gt 1000 ] || { echo "Backup lỗi: file quá nhỏ ($OUT)" >&2; exit 1; }
echo "Đã sao lưu: $OUT ($(du -h "$OUT" | cut -f1))"

# đẩy lên S3 nếu có cấu hình (bằng lớp lưu trữ của Sugami, không cần aws cli); lỗi thì bản trên máy vẫn còn
if [ -n "${S3_BUCKET:-}" ] && [ "${STORAGE_DRIVER:-s3}" = "s3" ]; then
  node scripts/upload-backup.mjs "$OUT" || echo "Đẩy S3 lỗi (bản trên máy vẫn còn)" >&2
fi

find "$DIR" -name 'sugami-*.sql.gz' -mtime +"$KEEP" -delete
