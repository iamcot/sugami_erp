'use client';

import { formatVnd } from '@sugami/shared';
import { AlertTriangle, Download } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DocumentEditor } from '@/components/document-editor';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { type DocDetail, fmtDateTime, STATUS_LABEL, TYPE_LABEL } from '@/lib/stock-documents';

export default function DocumentPage() {
  const { code } = useParams<{ code: string }>();
  const [d, setD] = useState<DocDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<DocDetail>(`/stock-documents/${encodeURIComponent(code)}`).then(setD, (e: Error) => setError(e.message));
  }, [code]);
  useEffect(load, [load]);

  const act = async (path: 'confirm' | 'cancel') => {
    setBusy(true);
    setError(null);
    try {
      setD(await api<DocDetail>(`/stock-documents/${encodeURIComponent(code)}/${path}`, { method: 'POST' }));
      setAskCancel(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!d) return error ? <p className="text-sm text-rose-600">{error}</p> : <p className="text-sm text-slate-500">Đang tải…</p>;
  const doc = d.document;
  const receipt = doc.type === 'receipt';

  if (editing)
    return (
      <>
        <PageHeader title={`Sửa ${doc.code}`} description={TYPE_LABEL[doc.type]} />
        <DocumentEditor
          type={doc.type}
          code={doc.code}
          initialReason={doc.reason ?? ''}
          initial={doc.lines.map((l) => ({ sku: l.sku, name: l.name, optionValues: l.optionValues, onHand: l.onHand, quantity: String(l.quantity), unitCost: l.unitCost === null ? '' : String(l.unitCost) }))}
        />
      </>
    );

  const total = doc.lines.reduce((a, l) => a + l.quantity * (l.unitCost ?? 0), 0);
  const fileUrl = `/api/stock-documents/${encodeURIComponent(doc.code)}/kiotviet.xlsx`;

  return (
    <>
      <PageHeader
        title={doc.code}
        description={`${TYPE_LABEL[doc.type]} · ${doc.warehouse.name} · tạo ${fmtDateTime(doc.createdAt)}${doc.reason ? ` · ${doc.reason}` : ''}`}
        actions={
          doc.status === 'draft' ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>Sửa</Button>
              <Button disabled={busy} onClick={() => void act('confirm')}>Xác nhận</Button>
            </>
          ) : doc.status === 'confirmed' ? (
            <a href={fileUrl} onClick={() => setTimeout(load, 1500)}>
              <Button><Download className="size-4" /> Tải file KiotViet</Button>
            </a>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={STATUS_LABEL[doc.status].tone}>{STATUS_LABEL[doc.status].label}</Badge>
        {doc.status === 'confirmed' &&
          (doc.exportedToKiotvietAt ? <Badge tone="brand">Đã xuất KiotViet {fmtDateTime(doc.exportedToKiotvietAt)}</Badge> : <Badge tone="warn">Chưa xuất KiotViet</Badge>)}
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {doc.status !== 'cancelled' && d.kiotviet.missingSkus.length > 0 && (
        <Card className="mb-4 flex gap-3 border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="size-5 shrink-0 text-amber-600" />
          <p>
            KiotViet chưa có {d.kiotviet.missingSkus.length} mã: <span className="font-mono">{d.kiotviet.missingSkus.slice(0, 8).join(', ')}</span>
            {d.kiotviet.missingSkus.length > 8 && '…'}. Nhập{' '}
            <Link href="/data/export" className="font-medium text-brand-600 underline">file sản phẩm mới</Link> vào KiotViet trước, nếu không KiotViet sẽ báo lỗi các dòng này.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
                <th className="px-3 py-2 text-right font-medium">{receipt ? 'Số lượng' : 'Đếm được'}</th>
                {receipt && <th className="px-3 py-2 text-right font-medium">Đơn giá vốn</th>}
                {receipt && <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Thành tiền</th>}
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Tồn hiện tại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {doc.lines.map((l) => (
                <tr key={l.sku}>
                  <td className="px-3 py-2">
                    <p className="line-clamp-1">{l.name}{l.optionValues?.length ? <span className="text-slate-500"> · {l.optionValues.join(' / ')}</span> : null}</p>
                    <p className="font-mono text-xs text-slate-500">
                      {l.sku}
                      {!l.inKiotviet && <span className="ml-2 font-sans text-amber-600">chưa có trên KiotViet</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.quantity.toLocaleString('vi-VN')}</td>
                  {receipt && <td className="px-3 py-2 text-right tabular-nums">{formatVnd(l.unitCost ?? 0)}</td>}
                  {receipt && <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{formatVnd(l.quantity * (l.unitCost ?? 0))}</td>}
                  <td className={`hidden px-3 py-2 text-right tabular-nums sm:table-cell ${l.onHand < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{l.onHand.toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {receipt && (
          <p className="border-t border-slate-200 px-3 py-2 text-right text-sm font-medium dark:border-slate-800">Tổng {formatVnd(total)}</p>
        )}
      </Card>

      {doc.status === 'confirmed' && (
        <Card className="mt-4 p-4 text-sm">
          <h2 className="font-medium">Đưa sang KiotViet</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-400">
            <li>Bấm <b>Tải file KiotViet</b> ở trên.</li>
            <li>
              Trên KiotViet: {receipt ? <><b>Hàng hóa → Nhập hàng</b>, tạo phiếu nhập mới</> : <><b>Hàng hóa → Kiểm kho</b>, tạo phiếu kiểm kho mới</>}, chọn nhập từ file Excel, chọn file vừa tải.
            </li>
            <li>{receipt ? 'Kiểm tra số lượng và giá rồi bấm Hoàn thành.' : 'KiotViet tự tính chênh lệch theo số đếm; kiểm tra rồi bấm Hoàn thành (cân bằng kho).'}</li>
          </ol>
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            {askCancel ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Hủy phiếu sẽ đảo lại tồn trong Sugami{doc.exportedToKiotvietAt ? '; phiếu bên KiotViet bạn phải hủy tay' : ''}.</span>
                <Button variant="secondary" disabled={busy} onClick={() => void act('cancel')}>Hủy phiếu</Button>
                <Button variant="ghost" onClick={() => setAskCancel(false)}>Không</Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setAskCancel(true)}>Hủy phiếu này…</Button>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
