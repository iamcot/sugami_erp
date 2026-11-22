import { formatVnd } from '@sugami/shared';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, PageHeader } from '@/components/ui';
import { products, salesByDay, todo } from '@/lib/mock';

const kpis = [
  { label: 'Doanh thu hôm nay', value: formatVnd(2960000), delta: 12 },
  { label: 'Đơn hôm nay', value: '8', delta: 14 },
  { label: 'Lãi gộp 30 ngày', value: formatVnd(14820000), delta: -3 },
  { label: 'Giá trị tồn kho', value: formatVnd(38450000), delta: 5 },
];

export default function DashboardPage() {
  const max = Math.max(...salesByDay.map((d) => d.shopee + d.tiktok));
  const lowStock = products.flatMap((p) =>
    p.variants.filter((v) => v.stock < v.minStock).map((v) => ({ p, v })),
  );
  return (
    <>
      <PageHeader title="Tổng quan" description="Chủ nhật, 22/11/2026" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs text-slate-500 sm:text-sm dark:text-slate-400">{k.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{k.value}</p>
            <p
              className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium ${k.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {k.delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(k.delta)}% so với kỳ trước
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Doanh thu 7 ngày theo kênh</h2>
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-orange-500" /> Shopee
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-slate-800 dark:bg-slate-200" /> TikTok Shop
              </span>
            </div>
          </div>
          <div className="mt-6 flex h-48 items-end gap-3">
            {salesByDay.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-md"
                  style={{ height: '10rem' }}
                >
                  <div
                    className="bg-orange-500"
                    style={{ height: `${(d.shopee / max) * 100}%` }}
                    title={formatVnd(d.shopee)}
                  />
                  <div
                    className="bg-slate-800 dark:bg-slate-200"
                    style={{ height: `${(d.tiktok / max) * 100}%` }}
                    title={formatVnd(d.tiktok)}
                  />
                </div>
                <span className="text-xs text-slate-500">{d.day}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-medium">Việc cần làm</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 text-sm hover:text-brand-600">
                  <Badge tone={t.tone}>{t.count}</Badge>
                  <span className="flex-1">{t.label}</span>
                  <ChevronRight className="size-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="font-medium">Sắp hết hàng</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 font-medium">Sản phẩm</th>
                <th className="py-2 font-medium">SKU</th>
                <th className="py-2 text-right font-medium">Tồn</th>
                <th className="py-2 text-right font-medium">Tối thiểu</th>
                <th className="py-2 text-right font-medium">Hàng về sau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lowStock.map(({ p, v }) => (
                <tr key={v.sku}>
                  <td className="py-2">
                    <Link
                      href={`/products/${p.code}`}
                      className="flex items-center gap-2 hover:text-brand-600"
                    >
                      <img src={p.image} alt="" className="size-8 rounded-md" />
                      <span className="line-clamp-1">{p.name}</span>
                    </Link>
                  </td>
                  <td className="py-2 font-mono text-xs">{v.sku}</td>
                  <td
                    className={`py-2 text-right tabular-nums ${v.stock === 0 ? 'text-rose-600' : 'text-amber-600'}`}
                  >
                    {v.stock}
                  </td>
                  <td className="py-2 text-right tabular-nums">{v.minStock}</td>
                  <td className="py-2 text-right text-slate-500">~12 ngày</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
