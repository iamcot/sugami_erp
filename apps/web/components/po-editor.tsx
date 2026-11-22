'use client';

import { formatVnd, landedCosts } from '@sugami/shared';
import { Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Field, inputCls } from '@/components/product-form-parts';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import type { InventoryResponse, InventoryRow } from '@/lib/inventory';
import type { PoDetail } from '@/lib/purchasing';

interface Line {
  sku: string;
  name: string;
  option: string;
  qty: string;
  /** Major units as typed: đồng, or yuan with decimals. */
  price: string;
}
interface CostRow {
  label: string;
  amount: string;
}
interface Supplier {
  id: string;
  name: string;
}

const digits = (s: string) => s.replace(/\D/g, '');
const dec = (s: string) => s.replace(',', '.').replace(/[^\d.]/g, '');
const toMinor = (price: string, currency: 'VND' | 'CNY') =>
  currency === 'CNY' ? Math.round(Number(price || 0) * 100) : Math.round(Number(price || 0));
const fromMinor = (n: number, currency: 'VND' | 'CNY') => String(currency === 'CNY' ? n / 100 : n);

/** Create a purchase order, or edit one that has not been received. */
export function PoEditor({ initial }: { initial?: PoDetail }) {
  const router = useRouter();
  const [currency, setCurrency] = useState<'VND' | 'CNY'>(initial?.currency ?? 'VND');
  const [fx, setFx] = useState(initial?.fxRate ? String(initial.fxRate) : '');
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newSupplier, setNewSupplier] = useState('');
  const [note, setNote] = useState(initial?.note ?? '');
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      option: l.option,
      qty: String(l.qty),
      price: fromMinor(l.unitPrice, initial.currency),
    })) ?? [],
  );
  const [costs, setCosts] = useState<CostRow[]>(
    initial?.costs.map((c) => ({ label: c.label, amount: String(c.amount) })) ?? [],
  );
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<InventoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ data: Supplier[] }>('/suppliers').then(
      (r) => setSuppliers(r.data),
      () => {},
    );
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<InventoryResponse>(`/inventory?${new URLSearchParams({ q: q.trim(), pageSize: '8' })}`, {
        signal: ctrl.signal,
      }).then(
        (r) => setHits(r.data),
        () => {},
      );
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const add = (r: InventoryRow) => {
    setLines((ls) =>
      ls.some((l) => l.sku === r.sku)
        ? ls
        : [
            ...ls,
            {
              sku: r.sku,
              name: r.productName,
              option: (r.optionValues ?? []).join(' / '),
              qty: '1',
              price: currency === 'VND' && r.costAvg ? String(r.costAvg) : '',
            },
          ],
    );
    setQ('');
    setHits([]);
    searchRef.current?.focus();
  };

  const upd = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const extra = costs.reduce((a, c) => a + (Number(digits(c.amount)) || 0), 0);
  // live preview of the landed unit cost, same maths as the server
  let preview: ReturnType<typeof landedCosts> = [];
  try {
    preview = lines.length
      ? landedCosts(
          lines.map((l) => ({ qty: Number(l.qty) || 0, unitPrice: toMinor(l.price, currency) })),
          { currency, fxRate: Number(fx) || null, extraCostVnd: extra },
        )
      : [];
  } catch {
    preview = [];
  }

  const addSupplier = async () => {
    const name = newSupplier.trim();
    if (!name) return;
    try {
      const r = await api<{ id: string }>('/suppliers', { method: 'POST', json: { name } });
      setSuppliers((s) => [...s, { id: r.id, name }].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
      setSupplierId(r.id);
      setNewSupplier('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = {
        supplierId: supplierId || null,
        currency,
        fxRate: currency === 'CNY' ? Number(fx) || null : null,
        note: note.trim() || null,
        lines: lines.map((l) => ({
          sku: l.sku,
          qty: Number(l.qty),
          unitPrice: toMinor(l.price, currency),
        })),
        costs: costs
          .filter((c) => c.label.trim() && Number(digits(c.amount)) > 0)
          .map((c) => ({ label: c.label.trim(), amount: Number(digits(c.amount)) })),
      };
      const r = initial
        ? await api<PoDetail>(`/purchase-orders/${initial.code}`, { method: 'PUT', json })
        : await api<PoDetail>('/purchase-orders', { method: 'POST', json });
      router.push(`/purchasing/${r.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const total = preview.reduce((a, l) => a + l.valueVnd + l.extraVnd, 0);

  return (
    <>
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <Field label="Nhà cung cấp / đơn vị trung gian">
            <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">(chưa chọn)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-2 flex gap-2">
            <input
              className={`${inputCls} mt-0`}
              placeholder="Hoặc gõ tên mới rồi bấm Thêm"
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
            />
            <Button variant="secondary" onClick={() => void addSupplier()} disabled={!newSupplier.trim()}>
              Thêm
            </Button>
          </div>
        </div>
        <Field label="Tiền tệ giá hàng">
          <select
            className={inputCls}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'VND' | 'CNY')}
            disabled={lines.length > 0}
          >
            <option value="VND">VND</option>
            <option value="CNY">CNY (tệ)</option>
          </select>
        </Field>
        {currency === 'CNY' && (
          <Field label="Tỷ giá (VND / 1 tệ)">
            <input
              className={inputCls}
              inputMode="decimal"
              value={fx}
              placeholder="3600"
              onChange={(e) => setFx(dec(e.target.value))}
            />
          </Field>
        )}
        <div className="md:col-span-4">
          <Field label="Ghi chú">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="mb-4 overflow-hidden">
        <div className="relative border-b border-slate-200 p-3 dark:border-slate-800">
          <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã hàng hoặc tên để thêm dòng…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {hits.length > 0 && (
            <ul className="absolute inset-x-3 top-full z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => add(h)}
                  >
                    <span>
                      {h.productName}
                      {h.optionValues?.length ? (
                        <span className="text-slate-500"> · {h.optionValues.join(' / ')}</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{h.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Hàng</th>
                <th className="px-4 py-2 text-right font-medium">Số lượng</th>
                <th className="px-4 py-2 text-right font-medium">
                  Đơn giá ({currency === 'CNY' ? 'tệ' : '₫'})
                </th>
                <th className="px-4 py-2 text-right font-medium">Giá vốn về kho</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Chưa có dòng nào, tìm hàng ở ô phía trên.
                  </td>
                </tr>
              )}
              {lines.map((l, i) => (
                <tr key={l.sku}>
                  <td className="px-4 py-2">
                    <div>{l.name}</div>
                    <div className="text-xs text-slate-500">
                      <span className="font-mono">{l.sku}</span>
                      {l.option && ` · ${l.option}`}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-900"
                      inputMode="decimal"
                      value={l.qty}
                      onChange={(e) => upd(i, { qty: dec(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-900"
                      inputMode="decimal"
                      value={l.price}
                      onChange={(e) =>
                        upd(i, { price: currency === 'CNY' ? dec(e.target.value) : digits(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {preview[i] ? formatVnd(preview[i]!.unitCost) : '–'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      aria-label="Bỏ dòng"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Chi phí khác (₫)</h2>
          <Button variant="secondary" onClick={() => setCosts([...costs, { label: '', amount: '' }])}>
            Thêm chi phí
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Ship, phí trung gian, thuế... Được chia vào giá vốn từng dòng theo giá trị hàng.
        </p>
        {costs.map((c, i) => (
          <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className={`${inputCls} mt-0 w-56`}
              placeholder="Ship Trung Quốc"
              value={c.label}
              onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <input
              className={`${inputCls} mt-0 w-36 text-right`}
              inputMode="numeric"
              placeholder="0"
              value={c.amount}
              onChange={(e) =>
                setCosts(costs.map((x, j) => (j === i ? { ...x, amount: digits(e.target.value) } : x)))
              }
            />
            <button
              className="text-sm text-slate-500 hover:text-rose-600"
              onClick={() => setCosts(costs.filter((_, j) => j !== i))}
            >
              Bỏ
            </button>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void save()}
          disabled={
            busy ||
            lines.length === 0 ||
            lines.some((l) => !Number(l.qty)) ||
            (currency === 'CNY' && !Number(fx))
          }
        >
          {busy ? 'Đang lưu…' : 'Lưu đơn nhập'}
        </Button>
        <span className="text-sm text-slate-600 dark:text-slate-300">
          Tổng giá vốn: <b className="tabular-nums">{formatVnd(total)}</b>
        </span>
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
    </>
  );
}
