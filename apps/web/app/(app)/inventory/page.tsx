'use client';

import { formatVnd } from '@sugami/shared';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/data-table';
import { Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { type InventoryResponse, type InventoryRow, stockTone } from '@/lib/inventory';
import { useQueryState } from '@/lib/use-query-state';

const VIEWS = [
  ['all', 'Tất cả'],
  ['in', 'Còn hàng'],
  ['out', 'Hết hàng'],
  ['negative', 'Tồn âm'],
  ['low', 'Dưới tối thiểu'],
] as const;

const qtyText = (n: number) => n.toLocaleString('vi-VN');

function InventoryList() {
  const [qs, setQs] = useQueryState({ q: '', view: 'all', sort: 'sku', dir: 'asc', page: '1' });
  const [search, setSearch] = useState(qs.q);
  const [res, setRes] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qs.q) setQs({ q: search, page: '1' });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qs.q, setQs]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    api<InventoryResponse>(`/inventory?${new URLSearchParams({ ...qs, pageSize: '50' })}`, {
      signal: ctrl.signal,
    })
      .then((r) => {
        setRes(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [qs.q, qs.view, qs.sort, qs.dir, qs.page]);

  // One column per warehouse only when the shop has more than one.
  const warehouses = res && res.warehouses.length > 1 ? res.warehouses : [];
  const columns: Column<InventoryRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      sortKey: 'sku',
      className: 'min-w-48',
      render: (r) => (
        <div className="min-w-0">
          <p className="line-clamp-1 font-medium">{r.productName}</p>
          <p className="font-mono text-xs text-slate-500">
            {r.sku}
            {r.optionValues && r.optionValues.length > 0 && (
              <span className="font-sans"> · {r.optionValues.join(' / ')}</span>
            )}
          </p>
        </div>
      ),
    },
    ...warehouses.map((w): Column<InventoryRow> => ({
      key: `wh-${w.code}`,
      header: w.name,
      align: 'right',
      className: 'hidden tabular-nums md:table-cell',
      render: (r) => {
        const q = r.byWarehouse[w.code] ?? 0;
        return <span className={stockTone(q)}>{qtyText(q)}</span>;
      },
    })),
    {
      key: 'stock',
      header: warehouses.length ? 'Tổng tồn' : 'Tồn',
      sortKey: 'stock',
      align: 'right',
      className: 'tabular-nums',
      render: (r) => <span className={stockTone(r.onHand, r.minStock)}>{qtyText(r.onHand)}</span>,
    },
    {
      key: 'min',
      header: 'Tối thiểu',
      align: 'right',
      className: 'hidden tabular-nums text-slate-500 sm:table-cell',
      render: (r) => (r.minStock > 0 ? qtyText(r.minStock) : '–'),
    },
    {
      key: 'value',
      header: 'Giá trị tồn',
      sortKey: 'value',
      align: 'right',
      className: 'hidden whitespace-nowrap tabular-nums md:table-cell',
      render: (r) => (r.value > 0 ? formatVnd(r.value) : '–'),
    },
  ];

  const t = res?.totals;
  const stats = t
    ? [
        { label: 'Số SKU', value: qtyText(t.skus) },
        { label: 'Tổng tồn', value: qtyText(t.units) },
        { label: 'Giá trị tồn (giá vốn)', value: formatVnd(t.value) },
        {
          label: 'Tồn âm / hết hàng',
          value: `${qtyText(t.negative)} / ${qtyText(t.out)}`,
          tone: t.negative > 0 ? 'text-rose-600' : '',
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Tồn kho"
        description="Tồn theo từng SKU và kho, tính từ sổ xuất nhập tồn"
        actions={
          <>
            <Link href="/inventory/documents">
              <Button variant="secondary">Phiếu kho</Button>
            </Link>
            <Link href="/inventory/documents/new?type=count">
              <Button variant="secondary">Kiểm kho</Button>
            </Link>
          </>
        }
      />
      {stats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className={`mt-0.5 text-lg font-semibold tabular-nums ${s.tone ?? ''}`}>{s.value}</p>
            </Card>
          ))}
        </div>
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
            </button>
          ))}
        </div>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm md:ml-auto md:max-w-xs dark:border-slate-800 dark:bg-slate-900">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên, SKU, mã vạch"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <DataTable
        columns={columns}
        rows={res?.data ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => `/products/${encodeURIComponent(r.productCode)}`}
        sort={{ sort: qs.sort, dir: qs.dir as 'asc' | 'desc' }}
        onSort={(s) => setQs({ ...s, page: '1' })}
        page={Number(qs.page)}
        pageSize={50}
        total={res?.total}
        onPage={(p) => setQs({ page: String(p) })}
        loading={loading}
        empty={qs.q ? `Không tìm thấy "${qs.q}"` : 'Không có SKU nào trong mục này.'}
      />
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryList />
    </Suspense>
  );
}
