import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { THEME_BOOT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sugami ERP',
  description: 'Quản lý kho, nguồn hàng, content và đơn hàng đa kênh',
  applicationName: 'Sugami',
  appleWebApp: { capable: true, title: 'Sugami', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#eef3f8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" data-accent="teal" data-mode="light" suppressHydrationWarning>
      <head>
        {/* apply the saved colour theme before first paint, so pages never flash the default */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Fredoka:wght@700&display=swap"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
