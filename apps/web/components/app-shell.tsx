'use client';

import { cn } from '@sugami/ui';
import {
  RefreshCw,
  ClipboardList,
  LayoutDashboard,
  Package,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  BarChart3,
  Bell,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DetailProvider } from './detail-drawer';
import { PwaBootstrap } from './app-settings';
import { UserMenu } from './user-menu';

const nav = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/pos', label: 'Bán hàng', icon: Receipt },
  { href: '/orders', label: 'Đơn hàng', icon: ShoppingBag },
  { href: '/products', label: 'Sản phẩm', icon: Package },
  { href: '/customers', label: 'Khách hàng', icon: Users },
  { href: '/purchasing', label: 'Nguồn hàng', icon: Truck },
  { href: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { href: '/data/import', label: 'Đồng bộ', icon: RefreshCw },
];

const mobileNav = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/pos', label: 'Bán hàng', icon: Receipt },
  { href: '/orders', label: 'Đơn', icon: ClipboardList },
  { href: '/products', label: 'Sản phẩm', icon: Package },
  { href: '/customers', label: 'Khách', icon: Users },
];

function isActive(pathname: string, href: string) {
  if (href.startsWith('#')) return false;
  if (href === '/products' && pathname.startsWith('/inventory')) return true;
  return href === '/' ? pathname === '/' : pathname.startsWith(href.split('/').slice(0, 2).join('/'));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh lg:pl-60">
      <PwaBootstrap />
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white px-3 py-4 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            S
          </span>
          <span className="font-semibold">Sugami ERP</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium',
                isActive(pathname, href)
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-50'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Settings className="size-4" />
          Cài đặt
        </Link>
      </aside>

      <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-brand-700 bg-brand-600 px-4 pt-[env(safe-area-inset-top)] text-white">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-bold text-brand-700 lg:hidden">
          S
        </span>
        {/* pages can put their own toolbar here (the sales page does); others get the site search */}
        <div id="app-header-slot" className="flex min-w-0 flex-1 items-center">
          {!pathname.startsWith('/pos') && (
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-white px-3 text-sm text-slate-500 md:max-w-md dark:bg-slate-900">
              <Search className="size-4 shrink-0" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
                placeholder="Tìm SKU, sản phẩm, đơn, kiện hàng..."
              />
              <kbd className="hidden rounded border border-slate-200 px-1.5 text-[10px] sm:block dark:border-slate-700">
                ⌘K
              </kbd>
            </label>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="hidden items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/90 sm:flex">
            <RefreshCw className="size-3.5" /> <SyncAge />
          </span>
          <button className="relative rounded-lg p-2 text-white hover:bg-white/20" aria-label="Thông báo">
            <Bell className="size-5" />
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-500" />
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
        <Suspense>
          <DetailProvider>{children}</DetailProvider>
        </Suspense>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900">
        {mobileNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              isActive(pathname, href) ? 'text-brand-600' : 'text-slate-500',
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Real age of the last Pancake order pull, refreshed every minute. */
function SyncAge() {
  const [at, setAt] = useState<string | null | undefined>(undefined);
  const [, tick] = useState(0);
  useEffect(() => {
    const load = () =>
      api<{ ordersSyncedAt: string | null }>('/pancake/sync-status').then(
        (r) => setAt(r.ordersSyncedAt),
        () => {},
      );
    void load();
    const t = setInterval(() => {
      tick((n) => n + 1);
      void load();
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  if (at === undefined) return <>Đồng bộ …</>;
  if (!at) return <>Chưa đồng bộ</>;
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000));
  if (m < 1) return <>Vừa đồng bộ</>;
  if (m < 60) return <>Đồng bộ {m} phút trước</>;
  if (m < 1440) return <>Đồng bộ {Math.floor(m / 60)} giờ trước</>;
  return <>Đồng bộ {Math.floor(m / 1440)} ngày trước</>;
}
