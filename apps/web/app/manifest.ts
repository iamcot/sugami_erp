import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sugami ERP',
    short_name: 'Sugami',
    description: 'Quản lý kho, đơn hàng và nguồn hàng của shop Sugami',
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Đơn hàng', url: '/orders' },
      { name: 'Tồn kho', url: '/inventory' },
      { name: 'Nhận hàng', url: '/inventory/receive' },
    ],
  };
}
