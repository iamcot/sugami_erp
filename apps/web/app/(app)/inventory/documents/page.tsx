'use client';

import { formatVnd } from '@sugami/shared';
import { ClipboardCheck, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/data-table';
import { Badge, Button, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { type DocStatus, type DocType, fmtDateTime, STATUS_LABEL, TYPE_LABEL } from '@/lib/stock-documents';
import { useQueryState } from '@/lib/use-query-state';

interface Row {
  code: string;
  type: DocType;
  status: DocStatus;
  reason: string | null;
  warehouse: { code: string; name: string };
  lineCount: number;
  units: number;
  value: number | null;
  createdAt: string;
  exportedToKiotvietAt: string | null;
}

const TABS = [
  ['all', 'Tất cả'],
  ['receipt', 'Nhập hàng'],
  ['count', 'Kiểm kho'],
  ['pending', 'Chưa xuất KiotViet'],
] as const;

const columns: Column<Row>[] = [
  {
    key: 'code',
    header: 'Phiếu',
    className: 'min-w-44',
    render: (d) => (
      <div>
        <p className="font-mono text-sm font-medium">{d.code}</p>
        <p className="text-xs text-slate-500">
          {TYPE_LABEL[d.type]}
          {d.reason && ` · ${d.reason}`}
        </p>
      </div>
    ),
  },
  { key: 'at', header: 'Ngày tạo', className: 'hidden whitespace-nowrap text-slate-600 md:table-cell', render: (d) => fmtDateTime(d.createdAt) },
  {
    key: 'lines',
    header: 'Số mã / SL',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (d) => `${d.lineCount} / ${d.units.toLocaleString('vi-VN')}`,
  },
  { key: 'value', header: 'Giá trị', align: 'right', className: 'hidden whitespace-nowrap tabular-nums sm:table-cell', render: (d) => (d.value === null ? '–' : formatVnd(d.value)) },
  {
    key: 'status',
    header: 'Trạng thái',
    render: (d) => (
      <div className="flex flex-wrap gap-1">
        <Badge tone={STATUS_LABEL[d.status].tone}>{STATUS_LABEL[d.status].label}</Badge>
        {d.status === 'confirmed' && (d.exportedToKiotvietAt ? <Badge tone="brand">Đã xuất KiotViet</Badge> : <Badge tone="warn">Chưa xuất</Badge>)}
      </div>
    ),
  },
];

function DocumentsList() {
  const [qs, setQs] = useQueryState({ tab: 'all', page: '1' });
  const [res, setRes] = useState<{ data: Row[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: qs.page, pageSize: '50' });
    if (qs.tab === 'receipt' || qs.tab === 'count') params.set('type', qs.tab);
    if (qs.tab === 'pending') params.set('notExported', '1');
    setLoading(true);
    api<{ data: Row[]; total: number }>(`/stock-documents?${params}`)
      .then((r) => {
        setRes(r);
        setError(null);
      }, (e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [qs.tab, qs.page]);

  return (
    <>
      <PageHeader
        title="Phiếu kho"
        description="Nhập hàng và kiểm kho làm trên Sugami, xuất file để nhập vào KiotViet"
        actions={
          <>
            <Link href="/inventory/documents/new?type=count">
              <Button variant="secondary"><ClipboardCheck className="size-4" /> Kiểm kho</Button>
            </Link>
            <Link href="/inventory/documents/new?type=receipt">
              <Button><PackagePlus className="size-4" /> Nhập hàng</Button>
            </Link>
          </>
        }
      />
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map(([v, label]) => (
          <button
            key={v}
            onClick={() => setQs({ tab: v, page: '1' })}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${qs.tab === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <DataTable
        columns={columns}
        rows={res?.data ?? []}
        rowKey={(d) => d.code}
        rowHref={(d) => `/inventory/documents/${d.code}`}
        page={Number(qs.page)}
        pageSize={50}
        total={res?.total}
        onPage={(p) => setQs({ page: String(p) })}
        loading={loading}
        empty={qs.tab === 'pending' ? 'Mọi phiếu đã xác nhận đều đã xuất sang KiotViet.' : 'Chưa có phiếu nào.'}
      />
    </>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsList />
    </Suspense>
  );
}
