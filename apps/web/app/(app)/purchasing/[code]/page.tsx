'use client';

import { formatVnd } from '@sugami/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { PoEditor } from '@/components/po-editor';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { money, type PoDetail, STATUS_LABEL, STATUS_TONE } from '@/lib/purchasing';

const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '–';

export default function PurchaseOrderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [po, setPo] = useState<PoDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<PoDetail>(`/purchase-orders/${encodeURIComponent(code)}`).then(setPo, (e: Error) =>
        setError(e.message),
      ),
    [code],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (what: 'order' | 'receive' | 'cancel') => {
    if (what === 'receive' && !window.confirm('Nhận hàng: cộng tồn kho và cập nhật giá vốn. Tiếp tục?'))
      return;
    if (what === 'cancel' && !window.confirm('Hủy đơn nhập này?')) return;
    setBusy(true);
    setError(null);
    try {
      setPo(
        await api<PoDetail>(`/purchase-orders/${encodeURIComponent(code)}/${what}`, {
          method: 'POST',
          json: {},
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!po)
    return error ? <p className="text-rose-600">{error}</p> : <p className="text-slate-500">Đang tải…</p>;
  const open = po.status === 'draft' || po.status === 'ordered';
  const extra = po.costs.reduce((a, c) => a + c.amount, 0);
  const goods = po.lines.reduce((a, l) => a + l.valueVnd, 0);

  return (
    <>
      <Link
        href="/purchasing"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Nguồn hàng
      </Link>
      <PageHeader
        title={po.code}
        description={[po.supplier, po.currency === 'CNY' ? `tỷ giá ${po.fxRate} ₫/tệ` : null, po.note]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Badge tone={STATUS_TONE[po.status]}>{STATUS_LABEL[po.status]}</Badge>
            {open && (
              <Button variant="secondary" onClick={() => setEditing((e) => !e)}>
                {editing ? 'Xem' : 'Sửa'}
              </Button>
            )}
            {po.status === 'draft' && (
              <Button variant="secondary" disabled={busy} onClick={() => void act('order')}>
                Đã đặt hàng
              </Button>
            )}
            {open && (
              <Button disabled={busy} onClick={() => void act('receive')}>
                Nhận hàng
              </Button>
            )}
            {open && (
              <Button variant="ghost" disabled={busy} onClick={() => void act('cancel')}>
                Hủy đơn
              </Button>
            )}
          </>
        }
      />
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      {editing ? (
        <PoEditor initial={po} />
      ) : (
        <>
          <Card className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Hàng</th>
                  <th className="px-4 py-2 text-right font-medium">SL</th>
                  <th className="px-4 py-2 text-right font-medium">Đơn giá</th>
                  <th className="px-4 py-2 text-right font-medium">Tiền hàng (₫)</th>
                  <th className="px-4 py-2 text-right font-medium">Chi phí chia</th>
                  <th className="px-4 py-2 text-right font-medium">Giá vốn / cái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {po.lines.map((l) => (
                  <tr key={l.sku}>
                    <td className="px-4 py-2">
                      <div>{l.name}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{l.sku}</span>
                        {l.option && ` · ${l.option}`}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.qty.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(l.unitPrice, po.currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatVnd(l.valueVnd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {formatVnd(l.extraVnd)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {formatVnd(l.unitCost)}
                      {po.status !== 'received' && l.currentCost > 0 && (
                        <div className="text-xs font-normal text-slate-500">
                          đang {formatVnd(l.currentCost)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="grid gap-1 p-4 text-sm md:max-w-md">
            <div className="flex justify-between">
              <span className="text-slate-500">Tiền hàng</span>
              <span className="tabular-nums">{formatVnd(goods)}</span>
            </div>
            {po.costs.map((c) => (
              <div key={c.label} className="flex justify-between">
                <span className="text-slate-500">{c.label}</span>
                <span className="tabular-nums">{formatVnd(c.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-100 pt-1 font-medium dark:border-slate-800">
              <span>Tổng giá vốn</span>
              <span className="tabular-nums">{formatVnd(goods + extra)}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Đặt hàng: {dt(po.orderedAt)} · Nhận: {dt(po.receivedAt)}
              {po.stockDocument && (
                <>
                  {' '}
                  ·{' '}
                  <Link
                    href={`/inventory/documents/${po.stockDocument}`}
                    className="text-brand-600 hover:underline"
                  >
                    Phiếu nhập {po.stockDocument}
                  </Link>
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
