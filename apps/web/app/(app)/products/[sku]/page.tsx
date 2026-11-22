import { cnyFenToVnd, formatCnyFen, formatVnd } from '@sugami/shared';
import { ArrowLeft, ExternalLink, Save } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Card, SyncDot } from '@/components/ui';
import { products } from '@/lib/mock';

const tabs = ['Thông tin', 'Biến thể', 'Hình ảnh', 'Content theo kênh', 'Tồn kho', 'Nguồn hàng', 'Lịch sử'];

export function generateStaticParams() {
  return products.map((p) => ({ sku: p.code }));
}

export default async function ProductDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const p = products.find((x) => x.code === sku);
  if (!p) notFound();
  return (
    <>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
      >
        <ArrowLeft className="size-4" /> Sản phẩm
      </Link>
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <img src={p.image} alt="" className="size-16 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-mono">{p.code}</span>
            {p.status === 'active' ? <Badge tone="success">Đang bán</Badge> : <Badge>Nháp</Badge>}
            {p.channels.shopee && <SyncDot state={p.channels.shopee} label="Shopee" />}
            {p.channels.tiktok && <SyncDot state={p.channels.tiktok} label="TikTok" />}
          </div>
        </div>
        <Button>
          <Save className="size-4" /> Lưu
        </Button>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${i === 0 ? 'border-brand-600 text-brand-700 dark:text-brand-50' : 'border-transparent text-slate-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="font-medium">Thông tin đồ chơi</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Nhóm hàng', p.category],
              ['Thương hiệu', p.brand],
              ['Độ tuổi', p.ageMin === 0 ? 'Mọi lứa tuổi' : `Từ ${p.ageMin} tuổi`],
              ['Chất liệu', p.material],
              ['Pin', p.battery ?? 'Không dùng pin'],
              ['Chứng nhận hợp quy', 'CR · QCVN 3:2019/BKHCN'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-500">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-6 font-medium">Biến thể</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 font-medium">SKU</th>
                  <th className="py-2 font-medium">Thuộc tính</th>
                  <th className="py-2 text-right font-medium">Giá bán</th>
                  <th className="py-2 text-right font-medium">Giá vốn</th>
                  <th className="py-2 text-right font-medium">Lãi gộp</th>
                  <th className="py-2 text-right font-medium">Tồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {p.variants.map((v) => {
                  const margin = v.cost ? Math.round(((v.price - v.cost) / v.price) * 100) : null;
                  return (
                    <tr key={v.sku}>
                      <td className="py-2 font-mono text-xs">{v.sku}</td>
                      <td className="py-2">{v.options.join(' / ') || '—'}</td>
                      <td className="py-2 text-right tabular-nums">{formatVnd(v.price)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {v.cost ? formatVnd(v.cost) : 'Chưa có'}
                      </td>
                      <td className="py-2 text-right tabular-nums">{margin === null ? '—' : `${margin}%`}</td>
                      <td
                        className={`py-2 text-right tabular-nums ${v.stock < v.minStock ? 'text-amber-600' : ''}`}
                      >
                        {v.stock}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          {p.source && (
            <Card className="p-4">
              <h2 className="font-medium">Nguồn hàng</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Sàn</span>
                  <span className="font-medium">{p.source.platform}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Shop</span>
                  <span className="truncate font-medium">{p.source.shop}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Giá nhập</span>
                  <span className="font-medium tabular-nums">
                    {formatCnyFen(p.source.priceCny)} ≈ {formatVnd(cnyFenToVnd(p.source.priceCny, 3650))}
                  </span>
                </div>
                <p className="pt-1 text-xs text-slate-500">
                  Giá vốn đã gồm phí mua hộ, ship nội địa TQ và phí trung gian theo cân nặng kiện.
                </p>
                <Button variant="secondary" className="mt-2 w-full">
                  <ExternalLink className="size-4" /> Mở link sản phẩm gốc
                </Button>
              </div>
            </Card>
          )}
          <Card className="p-4">
            <h2 className="font-medium">Hình ảnh</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <img
                  key={i}
                  src={p.image}
                  alt=""
                  className={`aspect-square w-full rounded-lg ${i === 0 ? 'ring-2 ring-brand-500' : ''}`}
                />
              ))}
              <button className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700">
                + Thêm
              </button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
