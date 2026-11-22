'use client';

import { formatVnd } from '@sugami/shared';
import { ImageOff, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/data-table';
import { useDetail } from '@/components/detail-drawer';
import { ListingsDrawer } from '@/components/listings-drawer';
import { PancakeIcon, ShopeeIcon, TikTokIcon } from '@/components/platform-icons';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import type { InventoryResponse } from '@/lib/inventory';
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

const tone = (n: number, total: number) =>
  (n === 0 ? 'neutral' : n >= total ? 'success' : 'warn') as 'neutral' | 'success' | 'warn';

function LinkChip({
  tone: t,
  icon,
  text,
  onClick,
}: {
  tone: 'neutral' | 'success' | 'warn';
  icon: React.ReactNode;
  text: string;
  onClick?: () => void;
}) {
  const color = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    warn: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  }[t];
  const cls = `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${color}`;
  return onClick ? (
    <button
      type="button"
      className={`${cls} hover:ring-1 hover:ring-slate-300`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {text}
    </button>
  ) : (
    <span className={cls}>
      {icon}
      {text}
    </span>
  );
}

const makeColumns = (
  openListings: (platform: 'shopee' | 'tiktok', p: ProductRow) => void,
): Column<ProductRow>[] => [
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
        <span title={`Pancake: ${p.links.pancake}/${p.variantCount} biến thể đã có trên Pancake`}>
          <LinkChip
            tone={tone(p.links.pancake, p.variantCount)}
            icon={<PancakeIcon />}
            text={`${p.links.pancake}/${p.variantCount}`}
          />
        </span>
        {(['shopee', 'tiktok'] as const).map((k) => (
          <span
            key={k}
            title={`${k === 'shopee' ? 'Shopee' : 'TikTok'}: ${p.links[k]}/${p.variantCount} biến thể đã nối trên Pancake. Bấm để xem tin đăng`}
          >
            <LinkChip
              tone={tone(p.links[k], p.variantCount)}
              icon={k === 'shopee' ? <ShopeeIcon /> : <TikTokIcon />}
              text={`${p.links[k]}/${p.variantCount}`}
              onClick={() => openListings(k, p)}
            />
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
  const [qs, setQs] = useQueryState({
    q: '',
    view: 'all',
    link: 'all',
    sort: 'updated',
    dir: 'desc',
    page: '1',
  });
  const [search, setSearch] = useState(qs.q);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listingsFor, setListingsFor] = useState<{
    platform: 'shopee' | 'tiktok';
    code: string;
    name: string;
  } | null>(null);
  const columns = makeColumns((platform, p) => setListingsFor({ platform, code: p.code, name: p.name }));
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [totals, setTotals] = useState<InventoryResponse['totals'] | null>(null);

  // Stock totals for the whole catalogue (the cards above the list).
  useEffect(() => {
    api<InventoryResponse>('/inventory?pageSize=1')
      .then((r) => setTotals(r.totals))
      .catch(() => setTotals(null));
  }, [version]);

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
        pancake: {
          onPancake: number;
          notInSugami: number;
          sampleNotInSugami: string[];
          sampleMulti: string[];
        };
      }>('/pancake/sync-listings', { method: 'POST', json: { dryRun: false } });
      setSyncMsg(
        `Đã đồng bộ: ${r.pancake.onPancake} biến thể có trên Pancake, ${r.listings} tin đăng sàn (${r.matched.link} biến thể sàn đã nối trên Pancake, ${r.unmatched} chưa nối). Tin đăng có liên kết trên Pancake: ${r.withLink}. Mã Pancake không có trong Sugami: ${r.pancake.notInSugami}${r.pancake.sampleNotInSugami.length ? ` (mẫu: ${r.pancake.sampleNotInSugami.join(', ')})` : ''}.${r.unmatchedLinks.length ? ` Mã liên kết trên Pancake không khớp SKU Sugami (mẫu): ${r.unmatchedLinks.join(', ')}.` : ''}${r.pancake.sampleMulti.length ? ` Sản phẩm nhiều biến thể chưa ghép được (mẫu): ${r.pancake.sampleMulti.join(' ; ')}.` : ''}`,
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
  }, [qs.q, qs.view, qs.link, qs.sort, qs.dir, qs.page, version]);

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
            <Link href="/inventory/documents">
              <Button variant="secondary">Phiếu kho</Button>
            </Link>
            <Link href="/inventory/documents/new?type=count">
              <Button variant="secondary">Kiểm kho</Button>
            </Link>
            <Link href="/data/import">
              <Button variant="secondary">Nhập từ KiotViet</Button>
            </Link>
          </>
        }
      />
      {totals && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'Số SKU', value: totals.skus.toLocaleString('vi-VN'), tone: '' },
            { label: 'Tổng tồn', value: totals.units.toLocaleString('vi-VN'), tone: '' },
            { label: 'Giá trị tồn (giá vốn)', value: formatVnd(totals.value), tone: '' },
            {
              label: 'Tồn âm / hết hàng',
              value: `${totals.negative.toLocaleString('vi-VN')} / ${totals.out.toLocaleString('vi-VN')}`,
              tone: totals.negative > 0 ? 'text-rose-600' : '',
            },
          ].map((c) => (
            <Card key={c.label} className="p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{c.label}</p>
              <p className={`mt-0.5 text-lg font-semibold tabular-nums ${c.tone}`}>{c.value}</p>
            </Card>
          ))}
        </div>
      )}
      {syncMsg && <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{syncMsg}</p>}
      {listingsFor && (
        <ListingsDrawer
          version={version}
          platform={listingsFor.platform}
          productCode={listingsFor.code}
          title={listingsFor.name}
          onClose={() => setListingsFor(null)}
        />
      )}
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
        <select
          value={qs.link}
          onChange={(e) => setQs({ link: e.target.value, page: '1' })}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="all">Mọi liên kết</option>
          <option value="no_pancake">Chưa kết nối Pancake</option>
          <option value="on_market">Đã kết nối sàn TMĐT</option>
        </select>
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
