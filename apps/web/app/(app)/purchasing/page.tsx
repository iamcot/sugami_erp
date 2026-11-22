'use client';

import { formatVnd } from '@sugami/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Field, inputCls } from '@/components/product-form-parts';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { type PoStatus, STATUS_LABEL, STATUS_TONE } from '@/lib/purchasing';

interface Row {
  code: string;
  status: PoStatus;
  supplier: string | null;
  currency: string;
  lineCount: number;
  qty: number;
  totalVnd: number;
  createdAt: string;
  receivedAt: string | null;
}
interface Supplier {
  id: string;
  name: string;
  platform: string | null;
  contact: string | null;
  orders: number;
}

const FILTERS: { id: PoStatus | ''; label: string }[] = [
  { id: '', label: 'Tất cả' },
  { id: 'draft', label: 'Nháp' },
  { id: 'ordered', label: 'Đã đặt hàng' },
  { id: 'received', label: 'Đã nhận' },
];
const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

export default function PurchasingPage() {
  const [status, setStatus] = useState<PoStatus | ''>('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadSuppliers = () =>
    api<{ data: Supplier[] }>('/suppliers').then(
      (r) => setSuppliers(r.data),
      () => {},
    );
  useEffect(() => {
    void loadSuppliers();
  }, []);
  useEffect(() => {
    setRows(null);
    api<{ data: Row[] }>(`/purchase-orders${status ? `?status=${status}` : ''}`).then(
      (r) => setRows(r.data),
      (e: Error) => setError(e.message),
    );
  }, [status]);

  const addSupplier = async () => {
    setError(null);
    try {
      await api('/suppliers', { method: 'POST', json: { name, platform: platform || null } });
      setName('');
      setPlatform('');
      await loadSuppliers();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Nguồn hàng"
        description="Đơn nhập hàng và nhà cung cấp. Nhận hàng sẽ cộng tồn và tính giá vốn."
        actions={
          <Link href="/purchasing/new">
            <Button>
              <Plus className="size-4" /> Đơn nhập mới
            </Button>
          </Link>
        }
      />
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatus(f.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${status === f.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Card className="mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2 font-medium">Mã đơn</th>
              <th className="px-4 py-2 font-medium">Nhà cung cấp</th>
              <th className="px-4 py-2 font-medium">Trạng thái</th>
              <th className="px-4 py-2 text-right font-medium">Số lượng</th>
              <th className="px-4 py-2 text-right font-medium">Tổng giá vốn</th>
              <th className="px-4 py-2 font-medium">Ngày tạo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows === null && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Đang tải…
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Chưa có đơn nhập nào.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/purchasing/${r.code}`} className="text-brand-600 hover:underline">
                    {r.code}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.supplier ?? <span className="text-slate-400">–</span>}</td>
                <td className="px-4 py-2">
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.qty.toLocaleString('vi-VN')} ({r.lineCount} mã)
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatVnd(r.totalVnd)}</td>
                <td className="px-4 py-2 text-slate-500">{dateFmt.format(new Date(r.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Nhà cung cấp ({suppliers.length})</h2>
        <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span>
                {s.name}
                {s.platform && <span className="ml-2 text-xs text-slate-500">{s.platform}</span>}
              </span>
              <span className="text-xs text-slate-500">{s.orders} đơn</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Tên nhà cung cấp">
            <input className={`${inputCls} w-64`} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Nguồn (taobao, 1688, trung gian...)">
            <input
              className={`${inputCls} w-56`}
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            />
          </Field>
          <Button variant="secondary" disabled={!name.trim()} onClick={() => void addSupplier()}>
            Thêm
          </Button>
        </div>
      </Card>
    </>
  );
}
