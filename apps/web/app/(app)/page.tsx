'use client';

import { formatVnd } from '@sugami/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import type { InventoryResponse } from '@/lib/inventory';

interface Sum {
  orders: number;
  revenue: number;
}
interface Dashboard {
  today: Sum;
  last7: Sum;
  last30: Sum;
  grossMargin30: { revenue: number; cost: number; profit: number; linesWithoutCost: number };
  stock: { value: number; units: number };
  series: { date: string; orders: number; byChannel: Record<string, number> }[];
  todo: { negativeSkus: number; outOfStockActive: number; zeroPrice: number };
  lastInvoiceImport: { importedAt: string; latestOrderAt: string } | null;
}

const CHANNELS = [
  { code: 'shopee', label: 'Shopee', className: 'bg-orange-500' },
  { code: 'tiktok', label: 'TikTok Shop', className: 'bg-slate-800 dark:bg-slate-200' },
  { code: 'other', label: 'Khác', className: 'bg-sky-400' },
];
const channelKey = (code: string) => (code === 'shopee' || code === 'tiktok' ? code : 'other');

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'hôm nay' : `${days} ngày trước`;
};

export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [negative, setNegative] = useState<InventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Dashboard>('/dashboard').then(setD, (e: Error) => setError(e.message));
    api<InventoryResponse>('/inventory?view=negative&sort=stock&dir=asc&pageSize=8').then(
      setNegative,
      () => {},
    );
  }, []);

  const kpis = d
    ? [
        { label: 'Doanh thu hôm nay', value: formatVnd(d.today.revenue), sub: `${d.today.orders} đơn` },
        { label: 'Doanh thu 7 ngày', value: formatVnd(d.last7.revenue), sub: `${d.last7.orders} đơn` },
        {
          label: 'Lãi gộp 30 ngày',
          value: formatVnd(d.grossMargin30.profit),
          sub: d.grossMargin30.revenue
            ? `${Math.round((d.grossMargin30.profit / d.grossMargin30.revenue) * 100)}% doanh thu ${formatVnd(d.grossMargin30.revenue)}`
            : 'chưa có đơn',
        },
        {
          label: 'Giá trị tồn kho',
          value: formatVnd(d.stock.value),
          sub: `${d.stock.units.toLocaleString('vi-VN')} sản phẩm`,
        },
      ]
    : [];

  const totals = d?.series.map((s) => Object.values(s.byChannel).reduce((a, b) => a + b, 0)) ?? [];
  const max = Math.max(1, ...totals);
  const todo = d
    ? [
        {
          count: d.todo.negativeSkus,
          label: 'SKU tồn âm, cần kiểm kho',
          href: '/inventory?view=negative',
          tone: 'danger' as const,
        },
        {
          count: d.todo.outOfStockActive,
          label: 'SKU đang bán nhưng hết hàng',
          href: '/inventory?view=out',
          tone: 'warn' as const,
        },
        { count: d.todo.zeroPrice, label: 'SKU chưa có giá bán', href: '/products', tone: 'warn' as const },
        ...(d.grossMargin30.linesWithoutCost > 0
          ? [
              {
                count: d.grossMargin30.linesWithoutCost,
                label: 'dòng đơn 30 ngày chưa có giá vốn',
                href: '/orders',
                tone: 'neutral' as const,
              },
            ]
          : []),
      ].filter((t) => t.count > 0)
    : [];

  return (
    <>
      <PageHeader title="Tổng quan" description={dateFmt.format(new Date())} />
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      {d?.lastInvoiceImport && (
        <Card className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
          <span>
            Hóa đơn KiotViet nhập lần cuối <b>{ago(d.lastInvoiceImport.importedAt)}</b>, đơn mới nhất ngày{' '}
            {new Date(d.lastInvoiceImport.latestOrderAt).toLocaleDateString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
            })}
            .
          </span>
          <Link href="/data/import" className="font-medium text-brand-600 hover:underline">
            Nhập file mới
          </Link>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {(kpis.length ? kpis : Array.from({ length: 4 }, () => null)).map((k, i) => (
          <Card key={k?.label ?? i} className="p-4">
            <p className="text-xs text-slate-500 sm:text-sm dark:text-slate-400">{k?.label ?? ' '}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{k?.value ?? '…'}</p>
            <p className="mt-1 text-xs text-slate-500">{k?.sub ?? ' '}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Doanh thu 14 ngày theo kênh</h2>
            <div className="flex gap-3 text-xs text-slate-500">
              {CHANNELS.map((c) => (
                <span key={c.code} className="flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-sm ${c.className}`} /> {c.label}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-6 flex h-48 items-end gap-1 sm:gap-2">
            {d?.series.map((s, i) => {
              const parts: Record<string, number> = {};
              for (const [code, v] of Object.entries(s.byChannel))
                parts[channelKey(code)] = (parts[channelKey(code)] ?? 0) + v;
              return (
                <div key={s.date} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800"
                    style={{ height: '10rem' }}
                    title={`${dayLabel(s.date)}: ${formatVnd(totals[i] ?? 0)} · ${s.orders} đơn`}
                  >
                    {CHANNELS.map((c) => (
                      <div
                        key={c.code}
                        className={c.className}
                        style={{ height: `${((parts[c.code] ?? 0) / max) * 100}%` }}
                      />
                    ))}
                  </div>
                  <span className={`text-[10px] text-slate-500 sm:text-xs ${i % 2 ? 'hidden sm:block' : ''}`}>
                    {dayLabel(s.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-medium">Việc cần làm</h2>
          {d && todo.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">Không có việc gì tồn đọng.</p>
          )}
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 text-sm hover:text-brand-600">
                  <Badge tone={t.tone}>{t.count.toLocaleString('vi-VN')}</Badge>
                  <span className="flex-1">{t.label}</span>
                  <ChevronRight className="size-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {negative && negative.data.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Tồn âm nhiều nhất</h2>
            <Link href="/inventory?view=negative" className="text-sm text-brand-600 hover:underline">
              Xem tất cả {negative.total.toLocaleString('vi-VN')}
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 font-medium">Sản phẩm</th>
                  <th className="hidden py-2 font-medium sm:table-cell">SKU</th>
                  <th className="py-2 text-right font-medium">Tồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {negative.data.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">
                      <Link
                        href={`/products/${encodeURIComponent(r.productCode)}`}
                        className="line-clamp-1 hover:text-brand-600"
                      >
                        {r.productName}
                        {r.optionValues?.length ? (
                          <span className="text-slate-500"> · {r.optionValues.join(' / ')}</span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="hidden py-2 font-mono text-xs sm:table-cell">{r.sku}</td>
                    <td className="py-2 text-right font-medium tabular-nums text-rose-600">
                      {r.onHand.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
