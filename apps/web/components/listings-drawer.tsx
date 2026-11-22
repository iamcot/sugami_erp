'use client';

import { formatVnd } from '@sugami/shared';
import { ChevronDown, ChevronRight, ImageOff, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LINKED_BY } from '@/components/listing-detail';
import { ShopeeIcon, TikTokIcon } from '@/components/platform-icons';
import { Badge, Button } from '@/components/ui';
import { api } from '@/lib/api';

interface Row {
  id: string;
  shop: string;
  platform: 'shopee' | 'tiktok' | null;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  variations: number;
  linked: number;
  priceMin: number | null;
  priceMax: number | null;
  quantity: number;
}
interface Detail {
  variations: {
    id: string;
    name: string | null;
    sku: string | null;
    price: number | null;
    quantity: number | null;
    linkedBy: string | null;
    variant: { sku: string; product: { name: string } } | null;
  }[];
}

export const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' } as const;
const PLATFORMS = [
  ['', 'Tất cả'],
  ['shopee', 'Shopee'],
  ['tiktok', 'TikTok'],
] as const;
const LINKS = [
  ['', 'Mọi trạng thái'],
  ['linked', 'Đã nối đủ'],
  ['partial', 'Nối một phần'],
  ['none', 'Chưa nối'],
] as const;
const PAGE = 30;

/** Marketplace listings pulled from Pancake, with the link status Pancake reports. Filter by platform. */
export function ListingsDrawer({
  onClose,
  version,
  platform: initialPlatform = '',
  productCode,
  title,
}: {
  onClose: () => void;
  version: number;
  platform?: '' | 'shopee' | 'tiktok';
  /** Only the listings linked to this Sugami product. */
  productCode?: string;
  title?: string;
}) {
  const [platform, setPlatform] = useState<string>(initialPlatform);
  const [link, setLink] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
    if (q) params.set('q', q);
    if (platform) params.set('platform', platform);
    if (productCode) params.set('productCode', productCode);
    if (link) params.set('link', link);
    api<{ data: Row[]; total: number }>(`/listings?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setRows(r.data);
        setTotal(r.total);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [q, platform, link, page, version, productCode]);

  const toggle = (id: string) => {
    setOpen((o) => (o === id ? null : id));
    if (!details[id])
      api<{ listing: Detail }>(`/listings/${encodeURIComponent(id)}`)
        .then((r) => setDetails((d) => ({ ...d, [id]: r.listing })))
        .catch((e: Error) => setError(e.message));
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const seg = (active: boolean) =>
    `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {platform === 'shopee' && <ShopeeIcon className="size-5" />}
              {platform === 'tiktok' && <TikTokIcon className="size-5" />}
              {title ?? 'Tin đăng sàn'}
            </h2>
            <p className="text-xs text-slate-500">
              Lấy từ Pancake; trạng thái nối là liên kết bên Pancake (Sugami không tự nối).
            </p>
          </div>
          <button onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {!productCode && (
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {PLATFORMS.map(([v, label]) => (
                  <button
                    key={v}
                    className={seg(platform === v)}
                    onClick={() => {
                      setPlatform(v);
                      setPage(1);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <select
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              {LINKS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tên tin, SKU sàn, mã hàng Sugami"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {rows.map((l) => {
            const isOpen = open === l.id;
            const d = details[l.id];
            return (
              <li key={l.id}>
                <button
                  onClick={() => toggle(l.id)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 shrink-0" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0" />
                  )}
                  {l.imageUrl ? (
                    <img
                      src={l.imageUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="size-10 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                    />
                  ) : (
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-300 dark:bg-slate-800">
                      <ImageOff className="size-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-slate-500">
                      {l.platform ? PLATFORM_LABEL[l.platform] : '?'} · {l.shop}
                      {l.priceMin !== null &&
                        ` · ${l.priceMin === l.priceMax ? formatVnd(l.priceMin) : `${formatVnd(l.priceMin)} – ${formatVnd(l.priceMax!)}`}`}
                    </p>
                  </div>
                  <Badge
                    tone={
                      l.linked === l.variations && l.variations > 0
                        ? 'success'
                        : l.linked
                          ? 'warn'
                          : 'neutral'
                    }
                  >
                    {l.linked}/{l.variations}
                  </Badge>
                </button>
                {isOpen && (
                  <div className="bg-slate-50 px-4 py-2 pl-14 text-sm dark:bg-slate-950/40">
                    {!d ? (
                      <p className="text-slate-500">Đang tải…</p>
                    ) : (
                      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                        {d.variations.map((v) => (
                          <li key={v.id} className="flex items-center justify-between gap-3 py-1.5">
                            <div className="min-w-0">
                              <p className="line-clamp-1">{v.name ?? '–'}</p>
                              <p className="font-mono text-xs text-slate-500">
                                {v.sku ?? '–'} · {v.price === null ? '–' : formatVnd(v.price)} · tồn sàn{' '}
                                {v.quantity ?? '–'}
                              </p>
                            </div>
                            {v.variant ? (
                              <span className="shrink-0 text-right text-xs">
                                <Badge tone="success">Đã nối</Badge>
                                <span className="mt-0.5 block font-mono text-slate-500">
                                  {v.variant.sku}
                                  {v.linkedBy && ` · ${LINKED_BY[v.linkedBy] ?? v.linkedBy}`}
                                </span>
                              </span>
                            ) : (
                              <Badge tone="warn">Chưa nối trên Pancake</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {!loading && rows.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              Chưa có tin đăng. Bấm "Đồng bộ từ Pancake" ở trang Sản phẩm.
            </li>
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-500 dark:border-slate-800">
          <span>
            {loading ? 'Đang tải…' : `${total.toLocaleString('vi-VN')} tin đăng`} · trang {page}/{pages}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Trước
            </Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Sau
            </Button>
          </span>
        </div>
      </aside>
    </div>
  );
}
