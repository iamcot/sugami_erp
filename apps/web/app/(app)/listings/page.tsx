'use client';

import { formatVnd } from '@sugami/shared';
import { ImageOff, RefreshCw, Search } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/data-table';
import { useDetail } from '@/components/detail-drawer';
import { Badge, Button, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useQueryState } from '@/lib/use-query-state';

interface Row {
  id: string;
  shop: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  variations: number;
  linked: number;
  priceMin: number | null;
  priceMax: number | null;
  quantity: number;
  syncedAt: string;
}
interface ListResponse {
  data: Row[];
  total: number;
  shops: { shop: string; listings: number }[];
}

const LINKS = [
  ['', 'Tất cả'],
  ['linked', 'Đã nối đủ'],
  ['partial', 'Nối một phần'],
  ['none', 'Chưa nối'],
] as const;

const columns: Column<Row>[] = [
  {
    key: 'name',
    header: 'Tin đăng',
    className: 'min-w-72',
    render: (l) => (
      <div className="flex items-center gap-3">
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
        <div className="min-w-0">
          <p className="line-clamp-2 font-medium">{l.name}</p>
          {l.sku && <p className="font-mono text-xs text-slate-500">{l.sku}</p>}
        </div>
      </div>
    ),
  },
  { key: 'shop', header: 'Shop', className: 'whitespace-nowrap', render: (l) => l.shop || '–' },
  {
    key: 'variations',
    header: 'Biến thể',
    align: 'right',
    className: 'tabular-nums',
    render: (l) => l.variations,
  },
  {
    key: 'price',
    header: 'Giá sàn',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (l) =>
      l.priceMin === null
        ? '–'
        : l.priceMin === l.priceMax
          ? formatVnd(l.priceMin)
          : `${formatVnd(l.priceMin)} – ${formatVnd(l.priceMax!)}`,
  },
  {
    key: 'qty',
    header: 'Tồn sàn',
    align: 'right',
    className: 'tabular-nums',
    render: (l) => l.quantity.toLocaleString('vi-VN'),
  },
  {
    key: 'linked',
    header: 'Nối Sugami',
    className: 'whitespace-nowrap',
    render: (l) => (
      <Badge tone={l.linked === l.variations && l.variations > 0 ? 'success' : l.linked ? 'warn' : 'neutral'}>
        {l.linked}/{l.variations}
      </Badge>
    ),
  },
];

function ListingsList() {
  const { open, selected } = useDetail();
  const [qs, setQs] = useQueryState({ q: '', shop: '', link: '', page: '1' });
  const [search, setSearch] = useState(qs.q);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const sync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api<{ listings: number; created: number; updated: number; unmatched: number }>(
        '/pancake/sync-listings',
        { method: 'POST', json: { dryRun: false } },
      );
      setSyncMsg(
        `Đã đồng bộ ${r.listings} tin (${r.created} mới, ${r.updated} cập nhật), ${r.unmatched} biến thể chưa nối.`,
      );
      setReload((n) => n + 1);
    } catch (e) {
      setSyncMsg((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qs.q) setQs({ q: search, page: '1' });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qs.q, setQs]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams(Object.entries({ ...qs, pageSize: '50' }).filter(([, v]) => v !== ''));
    api<ListResponse>(`/listings?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setRes(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [qs.q, qs.shop, qs.link, qs.page, reload]);

  return (
    <>
      <PageHeader
        title="Tin đăng sàn"
        description={
          res
            ? `${res.total.toLocaleString('vi-VN')} tin đăng (đồng bộ từ Pancake ở mục Nhập KiotViet → Đơn từ Pancake)`
            : undefined
        }
        actions={
          <Button variant="secondary" disabled={syncing} onClick={sync}>
            <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} /> Đồng bộ từ Pancake
          </Button>
        }
      />
      {syncMsg && <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{syncMsg}</p>}
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {LINKS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setQs({ link: v, page: '1' })}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${qs.link === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {res && res.shops.length > 1 && (
          <select
            value={qs.shop}
            onChange={(e) => setQs({ shop: e.target.value, page: '1' })}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <option value="">Mọi shop</option>
            {res.shops.map((s) => (
              <option key={s.shop} value={s.shop}>
                {s.shop || '(không tên)'} · {s.listings}
              </option>
            ))}
          </select>
        )}
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm md:ml-auto md:max-w-xs dark:border-slate-800 dark:bg-slate-900">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên tin, SKU sàn, mã hàng Sugami"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <DataTable
        columns={columns}
        rows={res?.data ?? []}
        rowKey={(l) => l.id}
        onRowClick={(l) => open('listing', l.id)}
        isSelected={(l) => selected.listing === l.id}
        page={Number(qs.page)}
        pageSize={50}
        total={res?.total}
        onPage={(p) => setQs({ page: String(p) })}
        loading={loading}
        empty="Chưa có tin đăng. Vào Nhập KiotViet → Đơn từ Pancake, bấm Đồng bộ tin đăng."
      />
    </>
  );
}

export default function ListingsPage() {
  return (
    <Suspense>
      <ListingsList />
    </Suspense>
  );
}
