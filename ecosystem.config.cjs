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
  restart_delay: 3000,
  max_memory_restart: '700M',
  ...extra,
});

module.exports = {
  apps: [
    node('sugami-api', 'api'),
    node('sugami-worker', 'worker'),
    {
      name: 'sugami-web',
      cwd: `${root}/apps/web`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: '700M',
    },
  ],
};
