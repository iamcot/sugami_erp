'use client';

import { ShopeeIcon, TikTokIcon } from '@/components/platform-icons';
import { formatVnd } from '@sugami/shared';
import { CloudUpload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { PancakePush } from '@/components/pancake-push';
import { useDetail } from '@/components/detail-drawer';
import { api } from '@/lib/api';
import { formatRelativeDateTime } from '@/lib/datetime';

interface Variant {
  id: string;
  sku: string;
  barcode: string | null;
  imageUrls: string[];
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
  listings: {
    id: string;
    name: string;
    shop: string;
    platform: 'shopee' | 'tiktok' | null;
    imageUrl: string | null;
    variantId: string;
    option: string | null;
    marketplaceSku: string | null;
    price: number | null;
    quantity: number | null;
  }[];
  createdAt: string;
  updatedAt: string;
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

export function ProductDetail({ code }: { code: string; embedded?: boolean }) {
  const { open } = useDetail();
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
  const prices = product.variants.map((v) => v.price);
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);
  const images = [...new Set(product.variants.flatMap((v) => v.imageUrls))];

  return (
    <>
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

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Biến thể', String(product.variants.length)],
          ['Tồn tổng', total.toLocaleString('vi-VN')],
          [
            'Giá bán',
            priceMin === priceMax ? formatVnd(priceMin) : `${formatVnd(priceMin)} – ${formatVnd(priceMax)}`,
          ],
          ['Cập nhật', formatRelativeDateTime(product.updatedAt)],
        ].map(([l, v]) => (
          <Card key={l} className="p-3">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="mt-1 text-base font-semibold tabular-nums">{v}</div>
          </Card>
        ))}
      </div>

      {images.length > 0 && (
        <Card className="mb-4 p-3">
          <div className="flex gap-2 overflow-x-auto">
            {images.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="shrink-0">
                <img
                  src={u}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-28 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                />
              </a>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-4 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-800">
          Biến thể ({product.variants.length}) · tồn {total.toLocaleString('vi-VN')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Biến thể</th>
                <th className="px-4 py-2 font-medium">Mã hàng</th>
                <th className="px-4 py-2 font-medium">Mã vạch</th>
                <th className="px-4 py-2 text-right font-medium">Giá bán</th>
                <th className="px-4 py-2 text-right font-medium">Giá vốn</th>
                <th className="px-4 py-2 text-right font-medium">Tồn</th>
                <th className="px-4 py-2 font-medium">Theo kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {product.variants.map((v) => (
                <tr key={v.id} className={v.status === 'inactive' ? 'opacity-50' : ''}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {v.imageUrls[0] && (
                        <img
                          src={v.imageUrls[0]}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-800"
                        />
                      )}
                      <span>
                        {v.optionValues.length ? (
                          v.optionValues.join(' / ')
                        ) : (
                          <span className="text-slate-400">Mặc định</span>
                        )}
                        {v.status === 'inactive' && (
                          <span className="ml-1 text-xs text-slate-500">(ngừng)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{v.sku}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{v.barcode ?? '–'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatVnd(v.price)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{formatVnd(v.costAvg)}</td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${v.onHand < 0 ? 'font-medium text-rose-600' : ''}`}
                  >
                    {v.onHand.toLocaleString('vi-VN')}
                    {v.minStock > 0 && v.onHand <= v.minStock && (
                      <span className="ml-1 text-xs text-amber-600">sắp hết</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {v.stock.length
                      ? v.stock.map((s) => `${s.warehouse}: ${s.onHand.toLocaleString('vi-VN')}`).join(' · ')
                      : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {product.listings.length > 0 && (
        <Card className="mb-4 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-800">
            Đang đăng trên sàn ({new Set(product.listings.map((l) => l.id)).size} tin)
          </div>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {[...product.listings]
              .sort((a, b) => (a.platform ?? '').localeCompare(b.platform ?? ''))
              .map((l) => (
                <li key={`${l.id}-${l.variantId}-${l.option}`}>
                  <button
                    onClick={() => open('listing', l.id)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    {l.imageUrl && (
                      <img
                        src={l.imageUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="size-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-800"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {l.platform === 'shopee' && <ShopeeIcon className="size-4 shrink-0" />}
                        {l.platform === 'tiktok' && <TikTokIcon className="size-4 shrink-0" />}
                        <span className="line-clamp-1">{l.name}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {[
                          l.platform === 'shopee' ? 'Shopee' : l.platform === 'tiktok' ? 'TikTok' : null,
                          l.option,
                          l.marketplaceSku,
                          product.variants.find((v) => v.id === l.variantId)?.sku &&
                            `→ ${product.variants.find((v) => v.id === l.variantId)?.sku}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {l.price === null ? '–' : formatVnd(l.price)}
                      {l.quantity !== null && (
                        <span className="block text-xs text-slate-500">tồn sàn {l.quantity}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      )}

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
