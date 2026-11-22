'use client';

import { formatVnd } from '@sugami/shared';
import { useEffect, useState } from 'react';
import { useDetail } from '@/components/detail-drawer';
import { Badge, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeDateTime } from '@/lib/datetime';

interface Variation {
  id: string;
  name: string | null;
  sku: string | null;
  price: number | null;
  quantity: number | null;
  images: string[];
  linkedBy: string | null;
  variant: {
    sku: string;
    barcode: string | null;
    price: number;
    product: { code: string; name: string };
  } | null;
}
interface Listing {
  id: string;
  source: string;
  shop: string;
  externalId: string;
  name: string;
  sku: string | null;
  price: number | null;
  imageUrl: string | null;
  syncedAt: string;
  variations: Variation[];
}

export const LINKED_BY: Record<string, string> = {
  link: 'Link trên Pancake',
  sku: 'Trùng mã hàng',
  barcode: 'Trùng mã vạch',
  orders: 'Học từ đơn',
  manual: 'Nối tay',
};

/** One marketplace listing with its options and the Sugami variant each is matched to. */
export function ListingDetail({ id }: { id: string; embedded?: boolean }) {
  const { open } = useDetail();
  const [l, setL] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ listing: Listing }>(`/listings/${encodeURIComponent(id)}`)
      .then((r) => setL(r.listing))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!l) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const linked = l.variations.filter((v) => v.variant).length;

  return (
    <>
      <PageHeader
        title={l.name}
        description={[
          l.shop || 'Shop',
          l.source === 'pancake' ? 'qua Pancake' : l.source,
          `Cập nhật ${formatRelativeDateTime(l.syncedAt)}`,
        ].join(' · ')}
        actions={
          <Badge tone={linked === l.variations.length ? 'success' : linked ? 'warn' : 'neutral'}>
            Nối {linked}/{l.variations.length}
          </Badge>
        }
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Biến thể trên sàn</th>
                <th className="px-4 py-2 font-medium">SKU sàn</th>
                <th className="px-4 py-2 text-right font-medium">Giá sàn</th>
                <th className="px-4 py-2 text-right font-medium">Tồn sàn</th>
                <th className="px-4 py-2 font-medium">Sản phẩm trong Sugami</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {l.variations.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {v.images[0] && (
                        <img
                          src={v.images[0]}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-9 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-800"
                        />
                      )}
                      <span>{v.name ?? '–'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{v.sku ?? '–'}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {v.price === null ? '–' : formatVnd(v.price)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{v.quantity ?? '–'}</td>
                  <td className="px-4 py-2">
                    {v.variant ? (
                      <button
                        onClick={() => open('product', v.variant!.product.code)}
                        className="text-left hover:underline"
                      >
                        <span className="block text-brand-700 dark:text-brand-50">
                          {v.variant.product.name}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          {v.variant.sku}
                          {v.linkedBy && ` · ${LINKED_BY[v.linkedBy] ?? v.linkedBy}`}
                        </span>
                      </button>
                    ) : (
                      <span className="text-amber-600">Chưa nối</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
