'use client';

import { cn } from '@sugami/ui';
import {
  Boxes,
  FileSpreadsheet,
  ClipboardList,
  Images,
  LayoutDashboard,
  Package,
  PenLine,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Truck,
  BarChart3,
  Bell,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PwaBootstrap } from './app-settings';
import { UserMenu } from './user-menu';

const nav = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/products', label: 'Sản phẩm', icon: Package },
  { href: '/inventory', label: 'Kho', icon: Boxes },
  { href: '/orders', label: 'Đơn hàng', icon: ShoppingBag },
  { href: '#sourcing', label: 'Nguồn hàng', icon: Truck },
  { href: '/media', label: 'Media', icon: Images },
  { href: '#content', label: 'Content', icon: PenLine },
  { href: '#reports', label: 'Báo cáo', icon: BarChart3 },
  { href: '/data/import', label: 'KiotViet', icon: FileSpreadsheet },
];

const mobileNav = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/orders', label: 'Đơn', icon: ClipboardList },
  { href: '/inventory', label: 'Kho', icon: Boxes },
  { href: '/products', label: 'Sản phẩm', icon: Package },
  { href: '/media', label: 'Media', icon: Images },
];

function isActive(pathname: string, href: string) {
  if (href.startsWith('#')) return false;
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
          href="#settings"
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Settings className="size-4" />
          Cài đặt
        </Link>
      </aside>

      <header className="sticky top-0 z-10 flex min-h-14 items-center pt-[env(safe-area-inset-top)] gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white lg:hidden">
          S
        </span>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 md:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <Search className="size-4 shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
            placeholder="Tìm SKU, sản phẩm, đơn, kiện hàng..."
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 text-[10px] sm:block dark:border-slate-700">
            ⌘K
          </kbd>
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="hidden items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-emerald-700 sm:flex dark:text-emerald-300">
            <RefreshCw className="size-3.5" /> Đồng bộ 2 phút trước
          </span>
          <button
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Thông báo"
          >
            <Bell className="size-5" />
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-500" />
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 lg:px-8 lg:pb-10">{children}</main>

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
