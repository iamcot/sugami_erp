// Kiểm tra .env đã có các biến quan trọng chưa (chỉ in có/chưa, không in giá trị) và API có đang chạy không.
import { existsSync } from 'node:fs';

if (!existsSync('.env')) console.log('Không thấy file .env ở thư mục này:', process.cwd());
else process.loadEnvFile('.env');

const keys = [
  'DATABASE_URL',
  'REDIS_URL',
  'APP_ENCRYPTION_KEY',
  'PANCAKE_API_KEY',
  'PANCAKE_SHOP_ID',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'S3_BUCKET',
];
for (const k of keys) console.log(`${process.env[k] ? 'có   ' : 'CHƯA '} ${k}`);

try {
  const port = process.env.API_PORT || 4000;
  const r = await fetch(`http://localhost:${port}/api/health`);
  console.log(
    `\nAPI trả lời (${r.status}). Nhớ khởi động lại API sau khi sửa .env: pm2 restart all --update-env`,
  );
} catch {
  console.log('\nKhông gọi được API trên máy này (đang tắt?)');
}
