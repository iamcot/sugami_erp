// Chạy thật trên iMac bằng pm2: `pm2 start ecosystem.config.cjs`. Xem docs/ops/chay-that.md.
// API và worker đọc biến môi trường từ .env ở thư mục gốc; web đã nhận cấu hình lúc build.
const root = __dirname;
const node = (name, dir, extra = {}) => ({
  name,
  cwd: `${root}/apps/${dir}`,
  script: 'dist/main.js',
  node_args: `--env-file=${root}/.env`,
  env: { NODE_ENV: 'production' },
  autorestart: true,
  // chưa có MySQL/Redis lúc mới mở máy thì tự thử lại, giãn dần tới 15 giây
  exp_backoff_restart_delay: 500,
  max_memory_restart: '700M',
  ...extra,
});

module.exports = {
  apps: [
    node('sugami-api', 'api'),
    node('sugami-worker', 'worker'),
    {
      // sao lưu DB mỗi đêm 3h sáng (pm2 chạy theo lịch, xong thì nghỉ)
      name: 'sugami-backup',
      cwd: root,
      script: 'scripts/backup.sh',
      interpreter: 'bash',
      cron_restart: '0 3 * * *',
      autorestart: false,
    },
    {
      name: 'sugami-web',
      cwd: `${root}/apps/web`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      exp_backoff_restart_delay: 500,
      max_memory_restart: '700M',
    },
  ],
};
