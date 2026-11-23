'use client';

import { cn } from '@sugami/ui';
import { Package, Receipt, Search, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatVnd } from '@sugami/shared';

interface Hit {
  key: string;
  icon: ReactNode;
  title: string;
  sub: string;
  href: string;
}
interface Group {
  label: string;
  more: string;
  hits: Hit[];
}

type Page<T> = { data: T[]; total?: number };

/**
 * Site search in the header: products (name, SKU), orders (code, marketplace code, tracking number,
 * phone, SKU) and customers (name, phone). Picking a hit opens it in the side panel of its list page.
 * ⌘K / Ctrl+K focuses it.
 */
export function GlobalSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [openList, setOpenList] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setGroups(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q: term, pageSize: '5' });
      const enc = encodeURIComponent(term);
      const opt = { signal: ctrl.signal };
      Promise.all([
        api<Page<{ code: string; name: string; priceMin: number; onHand: number }>>(
          `/products?${p}`,
          opt,
        ).catch(() => null),
        api<Page<{ code: string; total: number; status: string; customer: { name: string | null } | null }>>(
          `/orders?${p}`,
          opt,
        ).catch(() => null),
        api<Page<{ id: string; code: string | null; name: string | null; phone: string | null }>>(
          `/customers?${p}`,
          opt,
        ).catch(() => null),
      ]).then(([products, orders, customers]) => {
        if (ctrl.signal.aborted) return;
        const next: Group[] = [
          {
            label: 'Sản phẩm',
            more: `/products?q=${enc}`,
            hits: (products?.data ?? []).map((x) => ({
              key: `p:${x.code}`,
              icon: <Package className="size-4" />,
              title: x.name,
              sub: `${x.code} · tồn ${Number(x.onHand).toLocaleString('vi-VN')} · ${formatVnd(x.priceMin)}`,
              href: `/products?q=${enc}&d=product:${encodeURIComponent(x.code)}`,
            })),
          },
          {
            label: 'Đơn hàng',
            more: `/orders?q=${enc}`,
            hits: (orders?.data ?? []).map((x) => ({
              key: `o:${x.code}`,
              icon: <Receipt className="size-4" />,
              title: x.code,
              sub: `${x.customer?.name ?? 'Khách lẻ'} · ${formatVnd(x.total)}`,
              href: `/orders?q=${enc}&d=order:${encodeURIComponent(x.code)}`,
            })),
          },
          {
            label: 'Khách hàng',
            more: `/customers?q=${enc}`,
            hits: (customers?.data ?? []).map((x) => ({
              key: `c:${x.id}`,
              icon: <User className="size-4" />,
              title: x.name ?? x.phone ?? x.code ?? '—',
              sub: [x.phone, x.code].filter(Boolean).join(' · '),
              href: `/customers?q=${enc}&d=customer:${encodeURIComponent(x.code ?? x.id)}`,
            })),
          },
        ].filter((g) => g.hits.length);
        setGroups(next);
        setActive(0);
      });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const flat = groups?.flatMap((g) => g.hits) ?? [];
  const go = (href: string) => {
    setOpenList(false);
    input.current?.blur();
    router.push(href);
  };

  return (
    <div className="relative min-w-0 flex-1 md:max-w-lg">
      <label className="flex h-9 items-center gap-2 border border-slate-300/80 bg-white/75 px-3 text-sm text-slate-500 shadow-[inset_0_1px_3px_rgba(40,60,110,0.08)] dark:border-slate-700 dark:bg-slate-950/50">
        <Search className="size-4 shrink-0" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpenList(true);
          }}
          onFocus={() => setOpenList(true)}
          onBlur={() => setTimeout(() => setOpenList(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpenList(false);
              input.current?.blur();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flat.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && flat[active]) {
              go(flat[active].href);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          placeholder="Tìm sản phẩm, SKU, mã đơn, mã vận đơn, SĐT khách..."
        />
        <kbd className="hidden border border-slate-300 px-1.5 font-mono text-[10px] sm:block dark:border-slate-700">
          ⌘K
        </kbd>
      </label>
      {openList && groups && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto border border-slate-300/70 bg-[var(--glass-solid)] shadow-lg backdrop-blur-xl dark:border-white/10">
          {groups.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-500">Không tìm thấy “{q.trim()}”</p>
          )}
          {groups.map((g) => (
            <div
              key={g.label}
              className="border-b border-slate-200/70 py-1 last:border-b-0 dark:border-white/10"
            >
              <div className="flex items-center justify-between px-3 py-1">
                <span className="hud-label text-slate-500">{g.label}</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(g.more)}
                  className="text-xs text-brand-700 hover:underline dark:text-brand-500"
                >
                  Xem tất cả
                </button>
              </div>
              {g.hits.map((h) => {
                const i = flat.indexOf(h);
                return (
                  <button
                    key={h.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h.href)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-1.5 text-left',
                      i === active && 'bg-brand-50 dark:bg-white/10',
                    )}
                  >
                    <span className="text-slate-400">{h.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900 dark:text-slate-100">
                        {h.title}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-slate-500">{h.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
