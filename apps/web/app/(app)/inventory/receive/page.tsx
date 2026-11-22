'use client';

import { cn } from '@sugami/ui';
import { Camera, Check, Minus, Plus, ScanLine, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { parcel } from '@/lib/mock';

export default function ReceivePage() {
  const [counts, setCounts] = useState<Record<string, number>>({ 'XE4WD-DO': 10, 'XE4WD-XANH': 8 });
  const total = parcel.lines.reduce((n, l) => n + l.expected, 0);
  const received = Object.values(counts).reduce((n, c) => n + c, 0);
  const set = (sku: string, d: number) => setCounts((c) => ({ ...c, [sku]: Math.max(0, (c[sku] ?? 0) + d) }));

  return (
    <div className="mx-auto max-w-lg">
      <p className="text-sm text-slate-500">Nhận hàng</p>
      <h1 className="text-xl font-semibold tracking-tight">{parcel.code}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {parcel.forwarder} · {parcel.weightKg} kg · {parcel.po}
      </p>

      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between text-sm">
          <span>
            Đã đếm <b className="tabular-nums">{received}</b> / {total}
          </span>
          <Badge tone={received === total ? 'success' : 'warn'}>
            {received === total ? 'Đủ hàng' : `Còn ${total - received}`}
          </Badge>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${Math.min(100, (received / total) * 100)}%` }}
          />
        </div>
      </Card>

      <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-base font-medium text-white dark:bg-white dark:text-slate-900">
        <ScanLine className="size-5" /> Quét mã vạch
      </button>

      <ul className="mt-4 space-y-3">
        {parcel.lines.map((l) => {
          const c = counts[l.sku] ?? 0;
          const done = c === l.expected;
          return (
            <Card
              key={l.sku}
              className={cn(
                'flex items-center gap-3 p-3',
                done && 'border-emerald-300 dark:border-emerald-700',
              )}
            >
              <img src={l.image} alt="" className="size-12 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="font-mono text-xs text-slate-500">{l.sku}</p>
                <p className={cn('text-xs', done ? 'text-emerald-600' : 'text-slate-500')}>
                  {done ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="size-3" /> Đủ {l.expected}
                    </span>
                  ) : (
                    `Dự kiến ${l.expected}`
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => set(l.sku, -1)}
                  className="grid size-10 place-items-center rounded-lg border border-slate-200 dark:border-slate-700"
                  aria-label="Bớt"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center text-lg font-semibold tabular-nums">{c}</span>
                <button
                  onClick={() => set(l.sku, 1)}
                  className="grid size-10 place-items-center rounded-lg bg-brand-600 text-white"
                  aria-label="Thêm"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </Card>
          );
        })}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" className="py-3">
          <Camera className="size-4" /> Chụp hàng lỗi
        </Button>
        <Button variant="secondary" className="py-3">
          <TriangleAlert className="size-4" /> Báo thiếu
        </Button>
      </div>
      <Button className="mt-3 w-full py-3 text-base" disabled={received === 0}>
        Xác nhận nhập kho
      </Button>
    </div>
  );
}
