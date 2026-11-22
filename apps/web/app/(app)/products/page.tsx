'use client';

import { formatVnd } from '@sugami/shared';
import { ImageOff, RefreshCw, Search, Store } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/data-table';
import { useDetail } from '@/components/detail-drawer';
import { ListingsDrawer } from '@/components/listings-drawer';
import { Badge, Button, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useQueryState } from '@/lib/use-query-state';

interface ProductRow {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'draft' | 'archived';
  category: string | null;
  variantCount: number;
  image: string | null;
  priceMin: number;
  priceMax: number;
  onHand: number;
  negativeSkus: number;
  lowSkus: number;
  /** Variants on Pancake / linked by Pancake to a Shopee or TikTok listing (compare with variantCount). */
  links: { pancake: number; shopee: number; tiktok: number };
}
interface ListResponse {
  data: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}

const VIEWS = [
  ['all', 'Tất cả'],
  ['active', 'Đang bán'],
  ['out', 'Hết hàng'],
  ['negative', 'Tồn âm'],
  ['low', 'Sắp hết'],
  ['archived', 'Lưu trữ'],
] as const;

const STATUS: Record<ProductRow['status'], { label: string; tone: 'success' | 'neutral' | 'warn' }> = {
  active: { label: 'Đang bán', tone: 'success' },
  draft: { label: 'Nháp', tone: 'neutral' },
  archived: { label: 'Lưu trữ', tone: 'warn' },
};

const columns: Column<ProductRow>[] = [
  {
    key: 'name',
    header: 'Sản phẩm',
    sortKey: 'name',
    className: 'min-w-64',
    render: (p) => (
      <div className="flex items-center gap-3">
        {p.image ? (
          <img
            src={p.image}
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
        <div className="min-w-0">
          <p className="line-clamp-1 font-medium">{p.name}</p>
          <p className="font-mono text-xs text-slate-500">{p.code}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'variants',
    header: 'Biến thể',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (p) => p.variantCount.toLocaleString('vi-VN'),
  },
  {
    key: 'category',
    header: 'Nhóm',
    className: 'hidden whitespace-nowrap text-slate-600 md:table-cell dark:text-slate-400',
    render: (p) => p.category ?? '–',
  },
  {
    key: 'price',
    header: 'Giá bán',
    sortKey: 'price',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (p) =>
      p.priceMin === p.priceMax
        ? formatVnd(p.priceMin)
        : `${formatVnd(p.priceMin)} – ${formatVnd(p.priceMax)}`,
  },
  {
    key: 'stock',
    header: 'Tồn',
    sortKey: 'stock',
    align: 'right',
    className: 'tabular-nums',
    render: (p) => (
      <span
        className={
          p.onHand < 0 || p.negativeSkus > 0
            ? 'font-medium text-rose-600'
            : p.onHand === 0
              ? 'text-slate-400'
              : ''
        }
      >
        {p.onHand.toLocaleString('vi-VN')}
      </span>
    ),
  },
  {
    key: 'links',
    header: 'Liên kết',
    className: 'hidden whitespace-nowrap lg:table-cell',
    render: (p) => (
      <div className="flex gap-1">
        {(
          [
            ['pancake', 'Pancake'],
            ['shopee', 'Shopee'],
            ['tiktok', 'TikTok'],
          ] as const
        ).map(([k, label]) => (
          <span key={k} title={`${label}: ${p.links[k]}/${p.variantCount} biến thể đã kết nối`}>
            <Badge tone={p.links[k] === 0 ? 'neutral' : p.links[k] >= p.variantCount ? 'success' : 'warn'}>
              {label} {p.links[k]}/{p.variantCount}
            </Badge>
          </span>
        ))}
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Trạng thái',
    className: 'hidden sm:table-cell',
    render: (p) => <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>,
  },
];

function ProductsList() {
  const { open, selected } = useDetail();
  const [qs, setQs] = useQueryState({ q: '', view: 'all', sort: 'updated', dir: 'desc', page: '1' });
  const [search, setSearch] = useState(qs.q);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showListings, setShowListings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const sync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api<{
        listings: number;
        matched: { link: number };
        unmatched: number;
        withLink: number;
        unmatchedLinks: string[];
        pancake: { onPancake: number; notInSugami: number; sampleNotInSugami: string[] };
      }>('/pancake/sync-listings', { method: 'POST', json: { dryRun: false } });
      setSyncMsg(
        `Đã đồng bộ: ${r.pancake.onPancake} biến thể có trên Pancake, ${r.listings} tin đăng sàn (${r.matched.link} biến thể sàn đã nối trên Pancake, ${r.unmatched} chưa nối). Tin đăng có liên kết trên Pancake: ${r.withLink}. Mã Pancake không có trong Sugami: ${r.pancake.notInSugami}${r.pancake.sampleNotInSugami.length ? ` (mẫu: ${r.pancake.sampleNotInSugami.join(', ')})` : ''}.${r.unmatchedLinks.length ? ` Mã liên kết trên Pancake không khớp SKU Sugami (mẫu): ${r.unmatchedLinks.join(', ')}.` : ''}`,
      );
      setVersion((n) => n + 1);
    } catch (e) {
      setSyncMsg((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  // Debounce typing into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qs.q) setQs({ q: search, page: '1' });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qs.q, setQs]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ ...qs, pageSize: '50' });
    api<ListResponse>(`/products?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setRes(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [qs.q, qs.view, qs.sort, qs.dir, qs.page, version]);

  const counts = res?.counts ?? {};
  return (
    <>
      <PageHeader
        title="Sản phẩm"
        description={counts.all !== undefined ? `${counts.all.toLocaleString('vi-VN')} sản phẩm` : undefined}
        actions={
          <>
            <Button variant="secondary" disabled={syncing} onClick={sync}>
              <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} /> Đồng bộ từ Pancake
            </Button>
            <Button variant="secondary" onClick={() => setShowListings(true)}>
              <Store className="size-4" /> Tin đăng sàn
            </Button>
            <Link href="/data/import">
              <Button variant="secondary">Nhập từ KiotViet</Button>
            </Link>
          </>
        }
      />
      {syncMsg && <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{syncMsg}</p>}
      {showListings && <ListingsDrawer version={version} onClose={() => setShowListings(false)} />}
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setQs({ view: v, page: '1' })}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${qs.view === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
              {counts[v] !== undefined && (
                <span className="ml-1.5 text-xs text-slate-400">{counts[v].toLocaleString('vi-VN')}</span>
              )}
            </button>
          ))}
        </div>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm md:ml-auto md:max-w-xs dark:border-slate-800 dark:bg-slate-900">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên (gõ không dấu cũng được), mã, mã vạch"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <DataTable
        columns={columns}
        rows={res?.data ?? []}
        rowKey={(p) => p.id}
        onRowClick={(p) => open('product', p.code)}
        isSelected={(p) => selected.product === p.code}
        sort={{ sort: qs.sort, dir: qs.dir as 'asc' | 'desc' }}
        onSort={(s) => setQs({ ...s, page: '1' })}
        page={Number(qs.page)}
        pageSize={50}
        total={res?.total}
        onPage={(p) => setQs({ page: String(p) })}
        loading={loading}
        empty={
          qs.q
            ? `Không tìm thấy "${qs.q}"`
            : 'Chưa có sản phẩm. Nhập danh sách hàng hóa từ KiotViet để bắt đầu.'
        }
      />
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsList />
    </Suspense>
  );
}
