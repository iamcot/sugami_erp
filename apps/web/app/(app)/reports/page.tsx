'use client';

import { formatVnd } from '@sugami/shared';
import { useEffect, useMemo, useState } from 'react';
import { Card, Kpi, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

type By = 'month' | 'channel' | 'product' | 'sku';
interface Figures {
  orders: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  estimated: number;
  platformFee: number | null;
  profitAfterFees: number | null;
}
interface Report {
  total: Figures;
  rows: (Figures & { key: string; label: string; sub: string | null })[];
}

const TABS: { id: By; label: string }[] = [
  { id: 'month', label: 'Theo tháng' },
  { id: 'channel', label: 'Theo kênh' },
  { id: 'product', label: 'Theo sản phẩm' },
  { id: 'sku', label: 'Theo SKU' },
];
const vnDate = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  {
    id: 'month',
    label: 'Tháng này',
    range: () => {
      const t = vnDate(new Date());
      return [`${t.slice(0, 8)}01`, t];
    },
  },
  {
    id: '30',
    label: '30 ngày',
    range: () => [vnDate(new Date(Date.now() - 29 * 86_400_000)), vnDate(new Date())],
  },
  {
    id: '90',
    label: '3 tháng',
    range: () => [vnDate(new Date(Date.now() - 89 * 86_400_000)), vnDate(new Date())],
  },
  {
    id: 'year',
    label: 'Năm nay',
    range: () => {
      const t = vnDate(new Date());
      return [`${t.slice(0, 4)}-01-01`, t];
    },
  },
];
const pct = (m: number | null) => (m === null ? '–' : `${(m * 100).toFixed(1)}%`);

export default function ReportsPage() {
  const [preset, setPreset] = useState('30');
  const [by, setBy] = useState<By>('month');
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => PRESETS.find((p) => p.id === preset)!.range(), [preset]);

  useEffect(() => {
    setData(null);
    setError(null);
    api<Report>(`/reports/profit?${new URLSearchParams({ from: range[0], to: range[1], by })}`).then(
      setData,
      (e: Error) => setError(e.message),
    );
  }, [range, by]);

  const showFees = by === 'month' || by === 'channel';
  const t = data?.total;
  const kpis = t
    ? [
        {
          label: 'Doanh thu hàng',
          value: formatVnd(t.revenue),
          sub: `${t.orders} đơn · ${t.units.toLocaleString('vi-VN')} sản phẩm`,
        },
        {
          label: 'Giá vốn',
          value: formatVnd(t.cost),
          sub: t.estimated ? `${t.estimated} dòng chưa có giá vốn` : 'đủ giá vốn',
        },
        { label: 'Lãi gộp', value: formatVnd(t.profit), sub: `biên ${pct(t.margin)}` },
        {
          label: 'Sau phí sàn',
          value: t.profitAfterFees === null ? '–' : formatVnd(t.profitAfterFees),
          sub: t.platformFee === null ? 'xem theo tháng/kênh' : `phí sàn ${formatVnd(t.platformFee)}`,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Báo cáo lãi gộp"
        description={`${range[0].split('-').reverse().join('/')} – ${range[1].split('-').reverse().join('/')} · không tính đơn hủy/hoàn`}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${preset === p.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {(kpis.length ? kpis : Array.from({ length: 4 }, () => null)).map((k, i) => (
          <Kpi key={k?.label ?? i} label={k?.label ?? ' '} value={k?.value ?? '…'} sub={k?.sub ?? ' '} />
        ))}
      </div>
      {t && t.estimated > 0 && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          {t.estimated} dòng đơn chưa có giá vốn lúc bán: số liệu đang lấy giá vốn hiện tại của sản phẩm (nếu
          có), nên lãi có thể lệch. Nhập hàng để có giá vốn đúng.
        </p>
      )}
      <div className="mb-3 mt-4 flex gap-1 overflow-x-auto">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setBy(x.id)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${by === x.id ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2 font-medium">
                {TABS.find((x) => x.id === by)!.label.replace('Theo ', '')}
              </th>
              <th className="px-4 py-2 text-right font-medium">Đơn</th>
              <th className="px-4 py-2 text-right font-medium">SL</th>
              <th className="px-4 py-2 text-right font-medium">Doanh thu</th>
              <th className="px-4 py-2 text-right font-medium">Giá vốn</th>
              <th className="px-4 py-2 text-right font-medium">Lãi gộp</th>
              <th className="px-4 py-2 text-right font-medium">Biên</th>
              {showFees && <th className="px-4 py-2 text-right font-medium">Phí sàn</th>}
              {showFees && <th className="px-4 py-2 text-right font-medium">Sau phí sàn</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {!data && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                  Đang tải…
                </td>
              </tr>
            )}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                  Không có đơn trong khoảng này.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-2">
                  <div>{r.label}</div>
                  {r.sub && r.sub !== r.label && (
                    <div className="font-mono text-xs text-slate-500">{r.sub}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.orders}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.units.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatVnd(r.revenue)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {formatVnd(r.cost)}
                  {r.estimated > 0 && (
                    <span className="ml-1 text-amber-600" title={`${r.estimated} dòng tạm tính`}>
                      *
                    </span>
                  )}
                </td>
                <td
                  className={`px-4 py-2 text-right font-medium tabular-nums ${r.profit < 0 ? 'text-rose-600' : ''}`}
                >
                  {formatVnd(r.profit)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{pct(r.margin)}</td>
                {showFees && (
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {formatVnd(r.platformFee ?? 0)}
                  </td>
                )}
                {showFees && (
                  <td className="px-4 py-2 text-right tabular-nums">{formatVnd(r.profitAfterFees ?? 0)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {by === 'sku' || by === 'product' ? (
        <p className="mt-2 text-xs text-slate-500">
          Phí sàn tính theo đơn nên chỉ hiện ở báo cáo theo tháng và theo kênh. Hiện 300 dòng lãi cao nhất.
        </p>
      ) : null}
    </>
  );
}
