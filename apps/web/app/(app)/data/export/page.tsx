'use client';

import { formatVnd } from '@sugami/shared';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { KiotVietTabs } from '@/components/kiotviet-tabs';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { type DocType, fmtDateTime, TYPE_LABEL } from '@/lib/stock-documents';

interface NewProduct {
  sku: string;
  name: string;
  price: number;
  cost: number;
  parentSku: string | null;
}
interface PendingDoc {
  code: string;
  type: DocType;
  lineCount: number;
  units: number;
  confirmedAt: string | null;
  createdAt: string;
}

export default function ExportPage() {
  const [products, setProducts] = useState<{ total: number; data: NewProduct[] } | null>(null);
  const [docs, setDocs] = useState<PendingDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocs = () =>
    api<{ data: PendingDoc[] }>('/stock-documents?notExported=1&pageSize=100').then(
      (r) => setDocs(r.data),
      (e: Error) => setError(e.message),
    );
  useEffect(() => {
    api<{ total: number; data: NewProduct[] }>('/exports/kiotviet/new-products').then(
      setProducts,
      (e: Error) => setError(e.message),
    );
    void loadDocs();
  }, []);

  return (
    <>
      <PageHeader title="Đồng bộ dữ liệu" description="Trao đổi dữ liệu với KiotViet bằng file Excel" />
      <KiotVietTabs />
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Thứ tự nhập vào KiotViet: <b>1. sản phẩm mới</b> (nếu có), rồi <b>2. phiếu nhập hàng / kiểm kho</b>.
        KiotViet từ chối dòng có mã hàng nó chưa có.
      </p>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">1. Sản phẩm mới</h2>
            <p className="text-sm text-slate-500">
              {products === null
                ? 'Đang kiểm tra…'
                : products.total === 0
                  ? 'KiotViet đã có đủ mọi mã đang bán.'
                  : `${products.total} mã có trên Sugami nhưng chưa có trên KiotViet.`}
            </p>
          </div>
          {products && products.total > 0 && (
            <a href="/api/exports/kiotviet/new-products.xlsx">
              <Button>
                <Download className="size-4" /> Tải file sản phẩm mới
              </Button>
            </a>
          )}
        </div>
        {products && products.total > 0 && (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1.5 font-medium">Mã hàng</th>
                    <th className="py-1.5 font-medium">Tên</th>
                    <th className="py-1.5 text-right font-medium">Giá bán</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {products.data.slice(0, 20).map((p) => (
                    <tr key={p.sku}>
                      <td className="py-1.5 font-mono text-xs">
                        {p.sku}
                        {p.parentSku && <span className="text-slate-400"> ← {p.parentSku}</span>}
                      </td>
                      <td className="py-1.5">
                        <span className="line-clamp-1">{p.name}</span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatVnd(p.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Trên KiotViet: Hàng hóa → Nhập file → chọn file này. Tồn kho trong file bằng 0; tồn vào KiotViet
              qua phiếu nhập. Sau đó xuất lại danh sách hàng hóa từ KiotViet và nhập vào Sugami để Sugami biết
              các mã này đã có.
            </p>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">2. Phiếu chưa xuất sang KiotViet</h2>
            <p className="text-sm text-slate-500">
              {docs === null
                ? 'Đang tải…'
                : docs.length === 0
                  ? 'Không còn phiếu nào chờ xuất.'
                  : `${docs.length} phiếu đã xác nhận trên Sugami.`}
            </p>
          </div>
          <Link href="/inventory/documents">
            <Button variant="secondary">Tất cả phiếu kho</Button>
          </Link>
        </div>
        {docs && docs.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {docs.map((d) => (
              <li key={d.code} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <Link
                  href={`/inventory/documents/${d.code}`}
                  className="font-mono font-medium hover:text-brand-600"
                >
                  {d.code}
                </Link>
                <Badge>{TYPE_LABEL[d.type]}</Badge>
                <span className="text-slate-500">
                  {d.lineCount} mã · {d.units.toLocaleString('vi-VN')} sp ·{' '}
                  {fmtDateTime(d.confirmedAt ?? d.createdAt)}
                </span>
                <a
                  href={`/api/stock-documents/${d.code}/kiotviet.xlsx`}
                  onClick={() => setTimeout(() => void loadDocs(), 1500)}
                  className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                >
                  <Download className="size-4" /> Tải file
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
