'use client';

import { formatVnd } from '@sugami/shared';
import { Search, StickyNote } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type Column, DataTable } from '@/components/data-table';
import { useDetail } from '@/components/detail-drawer';
import { Badge, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useQueryState } from '@/lib/use-query-state';

interface CustomerRow {
  id: string;
  code: string | null;
  name: string | null;
  phone: string | null;
  region: string | null;
  note: string | null;
  tags: string[];
  isActive: boolean;
  lastPurchaseAt: string | null;
  kvTotalSales: number;
  kvDebt: number;
  orders: number;
  spent: number;
}
interface ListResponse {
  data: CustomerRow[];
  total: number;
}
interface Groups {
  data: { name: string; customers: number }[];
}

const SORTS = [
  ['recent', 'Mua gần đây'],
  ['spent', 'Mua nhiều nhất'],
  ['new', 'Mới tạo'],
  ['name', 'Tên A–Z'],
] as const;

const date = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '–';

/** Note icon; a click shows the note in a small popup (not the row's detail drawer). */
function NoteIcon({ note }: { note: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const off = () => setPos(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && off();
    window.addEventListener('click', off);
    window.addEventListener('scroll', off, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', off);
      window.removeEventListener('scroll', off, true);
      window.removeEventListener('keydown', key);
    };
  }, [pos]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label="Xem ghi chú"
        className="shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800"
        onClick={(e) => {
          e.stopPropagation();
          const r = ref.current?.getBoundingClientRect();
          if (r) setPos(pos ? null : { x: Math.min(r.left, window.innerWidth - 280), y: r.bottom + 4 });
        }}
      >
        <StickyNote className="size-4" />
      </button>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            onClick={(e) => e.stopPropagation()}
            style={{ left: Math.max(8, pos.x), top: pos.y }}
            className="fixed z-50 max-h-60 w-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {note}
          </div>,
          document.body,
        )}
    </>
  );
}

const columns: Column<CustomerRow>[] = [
  {
    key: 'name',
    header: 'Khách hàng',
    render: (c) => (
      <div>
        <div className="flex items-center gap-1 font-medium">
          {c.name ?? '(chưa có tên)'}
          {c.note && <NoteIcon note={c.note} />}
        </div>
        <p className="font-mono text-xs text-slate-500">{c.code}</p>
      </div>
    ),
  },
  {
    key: 'phone',
    header: 'Điện thoại',
    className: 'whitespace-nowrap tabular-nums',
    render: (c) => c.phone ?? <span className="text-slate-400">–</span>,
  },
  {
    key: 'region',
    header: 'Khu vực',
    className: 'hidden whitespace-nowrap text-slate-600 lg:table-cell dark:text-slate-400',
    render: (c) => c.region ?? '–',
  },
  {
    key: 'tags',
    header: 'Nhóm',
    className: 'hidden md:table-cell',
    render: (c) => (
      <div className="flex flex-wrap gap-1">
        {c.tags.slice(0, 3).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
    ),
  },
  {
    key: 'orders',
    header: 'Đơn trong Sugami',
    align: 'right',
    className: 'hidden whitespace-nowrap tabular-nums sm:table-cell',
    render: (c) => (c.orders ? `${c.orders} · ${formatVnd(c.spent)}` : '–'),
  },
  {
    key: 'sales',
    header: 'Tổng mua (KiotViet)',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (c) => formatVnd(c.kvTotalSales),
  },
  {
    key: 'last',
    header: 'Mua gần nhất',
    className: 'hidden whitespace-nowrap tabular-nums lg:table-cell',
    render: (c) => date(c.lastPurchaseAt),
  },
];

function CustomersList() {
  const { open, selected } = useDetail();
  const [qs, setQs] = useQueryState({ q: '', group: '', sort: 'recent', page: '1' });
  const [search, setSearch] = useState(qs.q);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [groups, setGroups] = useState<Groups['data']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Bumped when the drawer saved a customer, so the list reloads. */
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qs.q) setQs({ q: search, page: '1' });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qs.q, setQs]);

  useEffect(() => {
    api<Groups>('/customers/groups')
      .then((r) => setGroups(r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams(Object.entries({ ...qs, pageSize: '50' }).filter(([, v]) => v !== ''));
    api<ListResponse>(`/customers?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setRes(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [qs.q, qs.group, qs.sort, qs.page, reload]);

  const select =
    'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900';
  return (
    <>
      <PageHeader
        title="Khách hàng"
        description={res ? `${res.total.toLocaleString('vi-VN')} khách` : undefined}
      />
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <select
          value={qs.sort}
          onChange={(e) => setQs({ sort: e.target.value, page: '1' })}
          className={select}
        >
          {SORTS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={qs.group}
          onChange={(e) => setQs({ group: e.target.value, page: '1' })}
          className={select}
        >
          <option value="">Mọi nhóm</option>
          {groups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name} ({g.customers.toLocaleString('vi-VN')})
            </option>
          ))}
        </select>
        <label className="flex h-9 w-full min-w-0 shrink-0 items-center md:flex-1 gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm md:ml-auto md:max-w-xs dark:border-slate-800 dark:bg-slate-900">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên, SĐT, mã khách, mã đơn"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <DataTable
        columns={columns}
        rows={res?.data ?? []}
        rowKey={(c) => c.id}
        onRowClick={(c) => open('customer', c.code ?? c.id, { onSaved: () => setReload((n) => n + 1) })}
        isSelected={(c) => selected.customer === (c.code ?? c.id)}
        page={Number(qs.page)}
        pageSize={50}
        total={res?.total}
        onPage={(p) => setQs({ page: String(p) })}
        loading={loading}
        empty="Chưa có khách. Nhập file Khách hàng từ KiotViet ở mục KiotViet."
      />
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersList />
    </Suspense>
  );
}
