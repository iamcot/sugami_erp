'use client';

import { formatVnd } from '@sugami/shared';
import { ClipboardPaste, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import type { InventoryResponse, InventoryRow } from '@/lib/inventory';
import { type DocDetail, type DocType, TYPE_LABEL } from '@/lib/stock-documents';

export interface EditorLine {
  sku: string;
  name: string;
  optionValues: string[] | null;
  onHand: number;
  quantity: string;
  unitCost: string;
}

const toNum = (s: string) => Number(s.replace(/[.,\s]/g, ''));

/**
 * Line editor for receipts (quantity + landed unit cost) and stock counts (counted quantity).
 * The search box works with a barcode scanner: scan, Enter, next.
 */
export function DocumentEditor({
  type,
  code,
  initial = [],
  initialReason = '',
}: {
  type: DocType;
  code?: string;
  initial?: EditorLine[];
  initialReason?: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initial);
  const [reason, setReason] = useState(initialReason);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<InventoryRow[]>([]);
  const [paste, setPaste] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const receipt = type === 'receipt';

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<InventoryResponse>(`/inventory?${new URLSearchParams({ q: q.trim(), pageSize: '8' })}`, { signal: ctrl.signal }).then(
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
    setLines((ls) => {
      const i = ls.findIndex((l) => l.sku === r.sku);
      if (i >= 0) {
        if (!receipt) return ls;
        const copy = [...ls];
        copy[i] = { ...copy[i]!, quantity: String(toNum(copy[i]!.quantity || '0') + 1) };
        return copy;
      }
      return [...ls, { sku: r.sku, name: r.productName, optionValues: r.optionValues, onHand: r.onHand, quantity: receipt ? '1' : '', unitCost: receipt ? String(r.costAvg || '') : '' }];
    });
    setQ('');
    setHits([]);
    searchRef.current?.focus();
  };

  const onEnter = async () => {
    const term = q.trim();
    if (!term) return;
    const exact = hits.find((h) => h.sku === term) ?? (hits.length === 1 ? hits[0] : undefined);
    if (exact) return add(exact);
    const r = await api<InventoryResponse>(`/inventory?${new URLSearchParams({ q: term, pageSize: '2' })}`);
    if (r.data.length === 1) add(r.data[0]!);
    else setError(r.data.length ? `Có nhiều mã khớp "${term}", chọn trong danh sách` : `Không tìm thấy "${term}"`);
  };

  /** Paste rows "SKU<tab or ;>quantity[<tab or ;>unit cost]" from a spreadsheet. */
  const applyPaste = async () => {
    const rows = (paste ?? '')
      .split(/\r?\n/)
      .map((l) => l.split(/\t|;/).map((c) => c.trim()))
      .filter((c) => c[0]);
    const notFound: string[] = [];
    const found: EditorLine[] = [];
    for (const [sku, qty, cost] of rows) {
      const r = await api<InventoryResponse>(`/inventory?${new URLSearchParams({ q: sku!, pageSize: '5' })}`);
      const hit = r.data.find((d) => d.sku === sku);
      if (!hit) {
        notFound.push(sku!);
        continue;
      }
      found.push({ sku: hit.sku, name: hit.productName, optionValues: hit.optionValues, onHand: hit.onHand, quantity: qty ?? '', unitCost: receipt ? (cost ?? String(hit.costAvg || '')) : '' });
    }
    setLines((ls) => [...ls.filter((l) => !found.some((f) => f.sku === l.sku)), ...found]);
    setPaste(null);
    setError(notFound.length ? `Không có mã: ${notFound.join(', ')}` : null);
  };

  const update = (i: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async (confirm: boolean) => {
    setError(null);
    const bad = lines.find((l) => l.quantity === '' || Number.isNaN(toNum(l.quantity)) || (receipt && (l.unitCost === '' || Number.isNaN(toNum(l.unitCost)))));
    if (bad) return setError(`Dòng ${bad.sku} chưa nhập ${receipt ? 'số lượng/đơn giá' : 'số đếm'}`);
    setBusy(true);
    try {
      const body = {
        reason: reason.trim() || undefined,
        confirm,
        lines: lines.map((l) => ({ sku: l.sku, quantity: toNum(l.quantity), ...(receipt ? { unitCost: toNum(l.unitCost) } : {}) })),
      };
      const res = code
        ? await api<DocDetail>(`/stock-documents/${code}`, { method: 'PUT', json: body })
        : await api<DocDetail>('/stock-documents', { method: 'POST', json: { ...body, type } });
      router.push(`/inventory/documents/${res.document.code}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const totalQty = lines.reduce((a, l) => a + (toNum(l.quantity) || 0), 0);
  const totalValue = lines.reduce((a, l) => a + (toNum(l.quantity) || 0) * (toNum(l.unitCost) || 0), 0);
  const input = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-right tabular-nums outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900';

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <Search className="size-4 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onEnter();
                  }
                }}
                placeholder="Quét mã vạch hoặc gõ SKU, tên sản phẩm"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
              />
            </label>
            {hits.length > 0 && (
              <ul className="absolute inset-x-0 top-11 z-20 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button onClick={() => add(h)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1">{h.productName}{h.optionValues?.length ? ` · ${h.optionValues.join(' / ')}` : ''}</span>
                        <span className="font-mono text-xs text-slate-500">{h.sku}</span>
                      </span>
                      <span className="text-xs tabular-nums text-slate-500">tồn {h.onHand.toLocaleString('vi-VN')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button variant="secondary" onClick={() => setPaste(paste === null ? '' : null)}>
            <ClipboardPaste className="size-4" /> Dán từ Excel
          </Button>
        </div>
        {paste !== null && (
          <div className="mt-3 space-y-2">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder={receipt ? 'Mỗi dòng: SKU  số lượng  đơn giá (copy 3 cột từ Excel)' : 'Mỗi dòng: SKU  số đếm (copy 2 cột từ Excel)'}
              className="w-full rounded-lg border border-slate-200 bg-white p-2 font-mono text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
            />
            <Button variant="secondary" onClick={() => void applyPaste()}>Thêm các dòng</Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">{receipt ? 'Tồn hiện tại' : 'Tồn sổ'}</th>
                <th className="w-24 px-3 py-2 text-right font-medium">{receipt ? 'Số lượng' : 'Đếm được'}</th>
                {receipt && <th className="w-32 px-3 py-2 text-right font-medium">Đơn giá vốn</th>}
                {!receipt && <th className="w-20 px-3 py-2 text-right font-medium">Lệch</th>}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">Chưa có dòng nào. Quét hoặc tìm sản phẩm ở trên.</td>
                </tr>
              )}
              {lines.map((l, i) => {
                const diff = l.quantity === '' ? null : toNum(l.quantity) - l.onHand;
                return (
                  <tr key={l.sku}>
                    <td className="px-3 py-2">
                      <p className="line-clamp-1">{l.name}{l.optionValues?.length ? <span className="text-slate-500"> · {l.optionValues.join(' / ')}</span> : null}</p>
                      <p className="font-mono text-xs text-slate-500">{l.sku}</p>
                    </td>
                    <td className={`hidden px-3 py-2 text-right tabular-nums sm:table-cell ${l.onHand < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{l.onHand.toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2">
                      <input inputMode="numeric" aria-label={`Số lượng ${l.sku}`} className={input} value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                    </td>
                    {receipt && (
                      <td className="px-3 py-2">
                        <input inputMode="numeric" aria-label={`Đơn giá ${l.sku}`} className={input} value={l.unitCost} onChange={(e) => update(i, { unitCost: e.target.value })} />
                      </td>
                    )}
                    {!receipt && (
                      <td className={`px-3 py-2 text-right tabular-nums ${diff === null || diff === 0 ? 'text-slate-400' : diff < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {diff === null ? '–' : diff > 0 ? `+${diff}` : diff}
                      </td>
                    )}
                    <td className="px-1 py-2 text-center">
                      <button aria-label={`Xóa ${l.sku}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lines.length > 0 && (
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <span>{lines.length} mã · {totalQty.toLocaleString('vi-VN')} sản phẩm</span>
            {receipt && <span className="font-medium">Tổng {formatVnd(totalValue)}</span>}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={255}
          placeholder={receipt ? 'Ghi chú (vd: hàng về đợt 15/11, kiện TB123)' : 'Ghi chú (vd: kiểm kệ blindbox)'}
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy || lines.length === 0} onClick={() => void save(false)}>Lưu nháp</Button>
          <Button disabled={busy || lines.length === 0} onClick={() => void save(true)}>Xác nhận {receipt ? 'nhập kho' : 'kiểm kho'}</Button>
        </div>
      </Card>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <p className="text-xs text-slate-500">
        {receipt
          ? 'Xác nhận sẽ cộng tồn vào Sugami và cập nhật giá vốn bình quân. Sau đó tải file để nhập vào KiotViet.'
          : 'Xác nhận sẽ chỉnh tồn Sugami bằng số đếm. Sau đó tải file để KiotViet cân bằng kho theo cùng số.'}{' '}
        {TYPE_LABEL[type]} chưa xác nhận có thể sửa lại.
      </p>
    </div>
  );
}
