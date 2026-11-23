'use client';

import { cn } from '@sugami/ui';
import {
  BarChart3,
  Bell,
  ClipboardList,
  Clock,
  LayoutDashboard,
  type LucideIcon,
  Package,
  PackagePlus,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  PackageMinus,
  TriangleAlert,
  Truck,
  Undo2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DetailProvider } from './detail-drawer';
import { PlatformDiamond } from './platform-icons';
import { PwaBootstrap } from './app-settings';
import { UserMenu } from './user-menu';

type CountKey = 'waiting' | 'shipping' | 'returnPending' | 'shopee' | 'tiktok' | 'low' | 'negative';
type NavItem = { href: string; label: string; icon?: LucideIcon; platform?: string; count?: CountKey };
type Counts = Partial<Record<CountKey, number>>;

const navTop: NavItem[] = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { href: '/customers', label: 'Khách hàng', icon: Users },
];

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Đơn hàng',
    items: [
      { href: '/orders', label: 'Tất cả đơn', icon: ShoppingBag },
      { href: '/orders?group=waiting', label: 'Chờ đóng', icon: Clock, count: 'waiting' },
      { href: '/orders?group=shipping', label: 'Đang giao', icon: Truck, count: 'shipping' },
      {
        href: '/orders?group=return_pending',
        label: 'Hàng hoàn chờ xử lý',
        icon: Undo2,
        count: 'returnPending',
      },
      { href: '/pos', label: 'Bán tại quầy', icon: Receipt },
    ],
  },
  {
    title: 'Kho',
    items: [
      { href: '/products', label: 'Sản phẩm', icon: Package },
      { href: '/products?view=negative', label: 'Tồn âm', icon: TriangleAlert, count: 'negative' },
      { href: '/products?view=low', label: 'Sắp hết', icon: PackageMinus, count: 'low' },
      { href: '/inventory/documents', label: 'Phiếu kho', icon: ClipboardList },
      { href: '/purchasing', label: 'Nguồn hàng', icon: PackagePlus },
    ],
  },
  {
    title: 'Nền tảng',
    items: [
      { href: '/orders?channel=shopee', label: 'Shopee', platform: 'shopee', count: 'shopee' },
      { href: '/orders?channel=tiktok', label: 'TikTok Shop', platform: 'tiktok', count: 'tiktok' },
      { href: '/data/pancake', label: 'Pancake', platform: 'pancake' },
      { href: '/data/import', label: 'Đồng bộ KiotViet', icon: RefreshCw },
    ],
  },
];

const mobileNav = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/pos', label: 'Bán hàng', icon: Receipt },
  { href: '/orders', label: 'Đơn', icon: ClipboardList },
  { href: '/products', label: 'Sản phẩm', icon: Package },
  { href: '/customers', label: 'Khách', icon: Users },
];

const ALL_ITEMS = [...navTop, ...navSections.flatMap((s) => s.items)];

/**
 * The one menu item that matches the current page best: same path, and every query
 * parameter it names matches the URL (so "Đang giao" wins over "Tất cả đơn" on ?group=shipping).
 */
function activeHref(pathname: string, params: URLSearchParams): string | null {
  const path =
    pathname.startsWith('/inventory') && !pathname.startsWith('/inventory/documents')
      ? '/products'
      : pathname;
  let best: { href: string; score: number } | null = null;
  for (const { href } of ALL_ITEMS) {
    const [p, q] = href.split('?') as [string, string | undefined];
    const pathOk = p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`);
    if (!pathOk) continue;
    const want = new URLSearchParams(q ?? '');
    let ok = true;
    want.forEach((v, k) => {
      if (params.get(k) !== v) ok = false;
    });
    if (!ok) continue;
    const score = p.length * 10 + [...want.keys()].length;
    if (!best || score > best.score) best = { href, score };
  }
  return best?.href ?? null;
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href.split('/').slice(0, 2).join('/'));
}

const navItemClass = (on: boolean) =>
  cn(
    'relative flex h-8 items-center gap-3 border-l-2 pl-[18px] pr-3 text-[13px]',
    on
      ? 'border-brand-600 bg-gradient-to-r from-brand-600/15 to-transparent font-semibold text-brand-700 dark:border-brand-500 dark:text-brand-50'
      : 'border-transparent text-slate-700 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5',
  );

/** Menu numbers: what still needs hands (orders to pack, parcels back, stock problems). Refreshed every minute. */
function useNavCounts(pathname: string): Counts {
  const [c, setC] = useState<Counts>({});
  useEffect(() => {
    const load = () => {
      api<{
        waiting: number;
        shipping: number;
        returnPending: number;
        waitingByChannel: Record<string, number>;
      }>('/orders/counts').then(
        (r) =>
          setC((p) => ({
            ...p,
            waiting: r.waiting,
            shipping: r.shipping,
            returnPending: r.returnPending,
            shopee: r.waitingByChannel.shopee ?? 0,
            tiktok: r.waitingByChannel.tiktok ?? 0,
          })),
        () => {},
      );
      api<{ total: number; totals: { negative: number } }>('/inventory?view=low&pageSize=1').then(
        (r) => setC((p) => ({ ...p, low: r.total, negative: r.totals.negative })),
        () => {},
      );
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [pathname]);
  return c;
}

/** Urgent counts (things to act on) are filled; informational ones are plain text. */
const URGENT: CountKey[] = ['waiting', 'returnPending', 'negative'];

function SideNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = activeHref(pathname, params);
  const counts = useNavCounts(pathname);
  const item = ({ href, label, icon: Icon, platform, count }: NavItem) => (
    <Link key={href} href={href} className={navItemClass(active === href)}>
      {platform ? (
        <PlatformDiamond platform={platform} className="-mx-0.5 size-5" />
      ) : (
        Icon && <Icon className={cn('size-4', active === href ? 'text-brand-600' : 'text-slate-500')} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count && !!counts[count] && (
        <span
          className={cn(
            'font-mono text-[11px] tabular-nums',
            URGENT.includes(count)
              ? 'min-w-5 rounded-sm bg-brand-600 px-1 text-center font-semibold text-white shadow-[0_1px_4px_rgb(var(--accent-rgb)/0.4)]'
              : active === href
                ? 'text-brand-700 dark:text-brand-500'
                : 'text-slate-500',
          )}
        >
          {counts[count]!.toLocaleString('vi-VN')}
        </span>
      )}
    </Link>
  );
  return (
    <nav className="flex flex-1 flex-col overflow-y-auto pb-2">
      {navTop.map(item)}
      {navSections.map((s) => (
        <div key={s.title}>
          <div className="hud-label flex items-center gap-2 pb-1 pl-5 pr-4 pt-4 text-slate-500">
            {s.title}
            <span className="h-px flex-1 bg-gradient-to-r from-slate-300 to-transparent dark:from-slate-700" />
          </div>
          {s.items.map(item)}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh lg:pl-56">
      <PwaBootstrap />
      <aside className="glass fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-y-0 border-l-0 pt-3 lg:flex">
        <Link href="/" className="mb-3 flex items-center gap-2.5 px-4">
          <span className="btn-accent grid size-8 place-items-center text-sm font-bold">S</span>
          <span className="text-[15px] font-bold uppercase tracking-[0.18em]">Sugami</span>
        </Link>
        <div className="px-3 pb-2">
          <Link
            href="/pos"
            className="btn-accent flex h-9 items-center justify-center gap-2 text-sm font-semibold"
          >
            <Plus className="size-4" /> Tạo đơn
          </Link>
        </div>
        <Suspense>
          <SideNav />
        </Suspense>
        <Link
          href="/settings"
          className={cn(
            navItemClass(pathname.startsWith('/settings')),
            'mb-3 border-t border-t-slate-200/70 dark:border-t-slate-800',
          )}
        >
          <Settings className="size-4 text-slate-500" />
          Cài đặt
        </Link>
      </aside>

      <header className="glass sticky top-0 z-10 flex min-h-14 items-center gap-3 border-x-0 border-t-0 px-4 pt-[env(safe-area-inset-top)]">
        <span className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-70" />
        <span className="btn-accent grid size-8 shrink-0 place-items-center text-sm font-bold lg:hidden">
          S
        </span>
        {/* pages can put their own toolbar here (the sales page does); others get the site search */}
        <div id="app-header-slot" className="flex min-w-0 flex-1 items-center">
          {!pathname.startsWith('/pos') && (
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 border border-slate-300/80 bg-white/75 px-3 text-sm text-slate-500 shadow-[inset_0_1px_3px_rgba(40,60,110,0.08)] md:max-w-lg dark:border-slate-700 dark:bg-slate-950/50">
              <Search className="size-4 shrink-0" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
                placeholder="Tìm SKU, sản phẩm, đơn, kiện hàng..."
              />
              <kbd className="hidden border border-slate-300 px-1.5 font-mono text-[10px] sm:block dark:border-slate-700">
                ⌘K
              </kbd>
            </label>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="hidden items-center gap-1.5 px-2 py-1 font-mono text-[11px] text-slate-500 sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" />{' '}
            <SyncAge />
          </span>
          <button
            className="relative rounded-md p-2 text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Thông báo"
          >
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

      <nav className="glass fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobileNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              isActive(pathname, href) ? 'text-brand-700 dark:text-brand-500' : 'text-slate-500',
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
