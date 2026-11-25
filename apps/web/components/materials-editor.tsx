'use client';

import { formatVnd } from '@sugami/shared';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

/** One material of a finished product: quantity for ONE finished unit and the material's average cost. */
export interface Material {
  variantId: string;
  sku: string;
  name: string;
  qty: number;
  /** Average cost of one unit of the material, VND. */
  cost: number;
  /** What is left to sell (shown on the counter screen). */
  available?: number;
}

interface Hit {
  id: string;
  sku: string;
  productName: string;
  optionValues: unknown;
  cost: number;
  available: number;
}

/** Cost of one finished unit made of `list`, VND. */
export const materialsCost = (list: Pick<Material, 'qty' | 'cost'>[]) =>
  Math.round(list.reduce((a, m) => a + m.qty * m.cost, 0));

const label = (h: Hit) => {
  const opts = Object.values((h.optionValues ?? {}) as Record<string, unknown>).join(' / ');
  return `${h.productName}${opts ? ` - ${opts}` : ''}`;
};

/** Search box over the shop's materials; picking one calls `onPick`. */
export function MaterialSearch({
  onPick,
  autoFocus,
}: {
  onPick: (m: Material) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<{ data: Hit[] }>(`/pos/search?kind=material&q=${encodeURIComponent(q)}`).then(
        (r) => setHits(r.data),
        () => setHits([]),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        <Search className="size-4 text-slate-400" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          placeholder="Thêm nguyên liệu: tên hoặc mã…"
          value={q}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && hits.length > 0 && (
        <div className="popover absolute inset-x-0 top-10 z-30 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => {
                onPick({
                  variantId: h.id,
                  sku: h.sku,
                  name: label(h),
                  qty: 1,
                  cost: h.cost,
                  available: h.available,
                });
                setQ('');
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{label(h)}</span>
              <span className="font-mono text-xs text-slate-500">{h.sku}</span>
              <span className="w-20 text-right font-mono text-xs tabular-nums">{formatVnd(h.cost)}</span>
              <span className="w-14 text-right font-mono text-xs tabular-nums text-slate-500">
                còn {h.available.toLocaleString('vi-VN')}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && hits.length === 0 && q && (
        <p className="absolute inset-x-0 top-10 z-30 rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-500 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          Không thấy nguyên liệu. Tạo sản phẩm loại &quot;Nguyên liệu&quot; trước.
        </p>
      )}
    </div>
  );
}

/**
 * Bill of materials editor: materials with quantity per finished unit, their cost and the total cost of one
 * unit. `times` (counter screen) shows how much the whole line takes.
 */
export function MaterialsEditor({
  value,
  onChange,
  times,
}: {
  value: Material[];
  onChange: (next: Material[]) => void;
  times?: number;
}) {
  const set = (i: number, patch: Partial<Material>) =>
    onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const add = (m: Material) => {
    const at = value.findIndex((x) => x.variantId === m.variantId);
    if (at >= 0) set(at, { qty: value[at]!.qty + 1 });
    else onChange([...value, m]);
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">Nguyên liệu</th>
              <th className="w-24 py-1 text-right font-medium">SL / 1 SP</th>
              <th className="w-24 py-1 text-right font-medium">Giá vốn</th>
              <th className="w-28 py-1 text-right font-medium">Thành tiền</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {value.map((m, i) => {
              const need = m.qty * (times ?? 1);
              const short = m.available !== undefined && times !== undefined && need > m.available;
              return (
                <tr key={m.variantId}>
                  <td className="py-1.5">
                    <div className="truncate">{m.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {m.sku}
                      {times !== undefined && m.available !== undefined && (
                        <span className={short ? 'text-rose-600' : ''}>
                          {' '}
                          · cần {need.toLocaleString('vi-VN')}, còn {m.available.toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 text-right">
                    <input
                      className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-900"
                      inputMode="decimal"
                      value={String(m.qty)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(',', '.'));
                        if (Number.isFinite(n) && n >= 0) set(i, { qty: n });
                      }}
                    />
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums">{formatVnd(m.cost)}</td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                    {formatVnd(Math.round(m.qty * m.cost))}
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      aria-label="Bỏ nguyên liệu"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => onChange(value.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-1.5 text-xs text-slate-500" colSpan={3}>
                Giá vốn nguyên liệu cho 1 sản phẩm
              </td>
              <td className="py-1.5 text-right font-mono text-sm font-semibold tabular-nums">
                {formatVnd(materialsCost(value))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      <MaterialSearch onPick={add} />
    </div>
  );
}

/** Selling price, cost and the profit between them, coloured by sign. */
export function ProfitLine({ price, cost, qty = 1 }: { price: number; cost: number; qty?: number }) {
  const profit = (price - cost) * qty;
  const pct = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span>
        Giá vốn{' '}
        <b className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{formatVnd(cost * qty)}</b>
      </span>
      <span>
        Lời/lỗ{' '}
        <b
          className={`font-mono tabular-nums ${profit < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          {formatVnd(profit)}
        </b>
        {price > 0 && <span className="ml-1">({pct}%)</span>}
      </span>
    </div>
  );
}
