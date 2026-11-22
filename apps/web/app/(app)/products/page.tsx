import { formatVnd } from '@sugami/shared';
import { Download, Plus, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, PageHeader, SyncDot } from '@/components/ui';
import { products } from '@/lib/mock';

const tabs = ['Tất cả', 'Đang bán', 'Sắp hết', 'Nháp', 'Lỗi đồng bộ'];

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        title="Sản phẩm"
        description={`${products.length} sản phẩm · ${products.reduce((n, p) => n + p.variants.length, 0)} SKU`}
        actions={
          <>
            <Button variant="secondary">
              <Download className="size-4" /> Import Excel
            </Button>
            <Button>
              <Plus className="size-4" /> Thêm sản phẩm
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {tabs.map((t, i) => (
            <button
              key={t}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${i === 0 ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Button variant="secondary" className="ml-auto">
          <SlidersHorizontal className="size-4" /> Lọc
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2.5 font-medium">Sản phẩm</th>
                <th className="px-4 py-2.5 font-medium">Nhóm</th>
                <th className="px-4 py-2.5 text-right font-medium">Giá bán</th>
                <th className="px-4 py-2.5 text-right font-medium">Tồn</th>
                <th className="px-4 py-2.5 font-medium">Kênh</th>
                <th className="px-4 py-2.5 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => {
                const stock = p.variants.reduce((n, v) => n + v.stock, 0);
                const low = p.variants.some((v) => v.stock < v.minStock);
                const prices = [...new Set(p.variants.map((v) => v.price))];
                return (
                  <tr key={p.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <Link href={`/products/${p.code}`} className="flex items-center gap-3">
                        <img src={p.image} alt="" className="size-10 rounded-lg" />
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-medium hover:text-brand-600">{p.name}</p>
                          <p className="font-mono text-xs text-slate-500">
                            {p.code} · {p.variants.length} SKU
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                      {p.category}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {prices.map(formatVnd).join(' – ')}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${low ? 'font-medium text-amber-600' : ''}`}
                    >
                      {stock}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {p.channels.shopee && <SyncDot state={p.channels.shopee} label="Shopee" />}
                        {p.channels.tiktok && <SyncDot state={p.channels.tiktok} label="TikTok" />}
                        {!p.channels.shopee && !p.channels.tiktok && (
                          <span className="text-xs text-slate-400">Chưa đăng</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.status === 'active' ? <Badge tone="success">Đang bán</Badge> : <Badge>Nháp</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
