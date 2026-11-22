'use client';

import { formatVnd } from '@sugami/shared';
import { ArrowLeft, CloudUpload } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { PancakePush } from '@/components/pancake-push';
import { api } from '@/lib/api';

interface Variant {
  id: string;
  sku: string;
  barcode: string | null;
  optionValues: string[];
  price: number;
  costAvg: number;
  minStock: number;
  status: string;
  onHand: number;
  stock: { warehouse: string; onHand: number }[];
}
interface Product {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'draft' | 'archived';
  description: string | null;
  category: { name: string } | null;
  brand: { name: string } | null;
  options: string[];
  variants: Variant[];
}
type HistoryEntry =
  | {
      kind: 'change';
      at: string;
      action: string;
      entityType: string;
      sku: string | null;
      user: { name: string } | null;
      diff: Record<string, { from: unknown; to: unknown }> | null;
    }
  | {
      kind: 'stock';
      at: string;
      type: string;
      sku: string;
      warehouse: string;
      qtyDelta: string;
      balanceAfter: string;
      note: string | null;
    };

const MOVE_LABEL: Record<string, string> = {
  kiotviet_import: 'Tồn đầu kỳ (KiotViet)',
  opening: 'Tồn đầu kỳ',
  purchase_in: 'Nhập hàng',
  sale_out: 'Bán',
  return_in: 'Khách trả / hủy đơn',
  return_out: 'Trả NCC',
  transfer_in: 'Chuyển đến',
  transfer_out: 'Chuyển đi',
  adjust: 'Điều chỉnh',
  count: 'Kiểm kho',
  damage: 'Hỏng',
};
const FIELD_LABEL: Record<string, string> = {
  price: 'Giá bán',
  name: 'Tên',
  status: 'Trạng thái',
  minStock: 'Tồn tối thiểu',
  barcode: 'Mã vạch',
  optionValues: 'Phân loại',
  categoryId: 'Nhóm',
  description: 'Mô tả',
};
const ACTION_LABEL: Record<string, string> = { create: 'Tạo', update: 'Sửa', delete: 'Xóa' };

const dt = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
const show = (v: unknown) =>
  v === null || v === undefined || v === '' ? '–' : Array.isArray(v) ? v.join(' / ') : String(v);

export default function ProductDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pancakeOpen, setPancakeOpen] = useState(false);

  useEffect(() => {
    api<{ product: Product }>(`/products/${encodeURIComponent(decodeURIComponent(code))}`)
      .then(async ({ product: p }) => {
        setProduct(p);
        const h = await api<{ data: HistoryEntry[] }>(`/products/${p.id}/history?limit=100`);
        setHistory(h.data);
      })
      .catch((e: Error) => setError(e.message));
  }, [code]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!product) return <p className="text-slate-500">Đang tải…</p>;
  const total = product.variants.reduce((a, v) => a + v.onHand, 0);

  return (
    <>
      <Link
        href="/products"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Sản phẩm
      </Link>
      <PageHeader
        title={product.name}
        description={[product.code, product.category?.name, product.brand?.name].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPancakeOpen((o) => !o)}>
              <CloudUpload className="size-4" /> Pancake
            </Button>
            <Badge tone={product.status === 'active' ? 'success' : 'neutral'}>
              {product.status === 'active' ? 'Đang bán' : product.status === 'draft' ? 'Nháp' : 'Lưu trữ'}
            </Badge>
          </>
        }
      />
      {pancakeOpen && <PancakePush code={product.code} onClose={() => setPancakeOpen(false)} />}

      <Card className="mb-4 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-800">
          {product.variants.length} mã hàng · tồn {total.toLocaleString('vi-VN')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Mã hàng</th>
                {product.options.map((o) => (
                  <th key={o} className="px-4 py-2 font-medium">
                    {o}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Giá bán</th>
                <th className="px-4 py-2 text-right font-medium">Giá vốn</th>
                <th className="px-4 py-2 text-right font-medium">Tồn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 font-mono text-xs">{v.sku}</td>
                  {product.options.map((o, i) => (
                    <td key={o} className="px-4 py-2">
                      {show(v.optionValues[i])}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">{formatVnd(v.price)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{formatVnd(v.costAvg)}</td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${v.onHand < 0 ? 'font-medium text-rose-600' : ''}`}
                  >
                    {v.onHand.toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {product.description && (
        <Card className="mb-4 whitespace-pre-line p-4 text-sm text-slate-700 dark:text-slate-300">
          {product.description}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-800">
          Lịch sử
        </div>
        {history.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Chưa có thay đổi.</p>}
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {history.map((h, i) => (
            <li key={i} className="flex gap-3 px-4 py-2">
              <span className="w-28 shrink-0 tabular-nums text-slate-500">{dt(h.at)}</span>
              {h.kind === 'stock' ? (
                <span>
                  <span className="font-mono text-xs">{h.sku}</span> · {MOVE_LABEL[h.type] ?? h.type}{' '}
                  <span className={Number(h.qtyDelta) < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                    {Number(h.qtyDelta) > 0 ? '+' : ''}
                    {Number(h.qtyDelta).toLocaleString('vi-VN')}
                  </span>{' '}
                  → {Number(h.balanceAfter).toLocaleString('vi-VN')}
                  {h.note && <span className="text-slate-500"> · {h.note}</span>}
                </span>
              ) : (
                <span>
                  {ACTION_LABEL[h.action] ?? h.action}{' '}
                  {h.entityType === 'variant' ? (
                    <span className="font-mono text-xs">{h.sku ?? 'mã hàng'}</span>
                  ) : (
                    'sản phẩm'
                  )}
                  {h.action === 'update' && h.diff && (
                    <span className="text-slate-600 dark:text-slate-400">
                      {': '}
                      {Object.entries(h.diff)
                        .map(([f, d]) => `${FIELD_LABEL[f] ?? f} ${show(d.from)} → ${show(d.to)}`)
                        .join('; ')}
                    </span>
                  )}
                  {h.user && <span className="text-slate-500"> · {h.user.name}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
