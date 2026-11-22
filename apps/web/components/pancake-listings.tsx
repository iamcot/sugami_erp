'use client';

import { Store } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';

interface Result {
  dryRun: boolean;
  listings: number;
  variations: number;
  created: number;
  updated: number;
  matched: { link: number; sku: number; barcode: number; orders: number };
  unmatched: number;
  unmatchedSkus: string[];
  skippedOtherCountry: number;
  removedOtherCountry: number;
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

/** Copy the marketplace listings Pancake pulled into Sugami and match their options to Sugami variants. */
export function PancakeListings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/pancake/sync-listings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const body = (await r.json().catch(() => ({}))) as Result & { message?: string };
      if (!r.ok) throw new Error(body.message ?? `Lỗi ${r.status}`);
      setRes(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const matched = res ? res.matched.link + res.matched.sku + res.matched.barcode + res.matched.orders : 0;
  return (
    <Card className="mb-4 p-4">
      <h2 className="text-sm font-medium">Tin đăng trên sàn</h2>
      <p className="mt-1 text-xs text-slate-500">
        Lưu bản sao các tin đăng Shopee/TikTok Pancake đã kéo về (tiêu đề, biến thể, giá, tồn, ảnh) và nối
        từng biến thể với sản phẩm Sugami theo link trên Pancake, mã hàng, mã vạch hoặc mã học từ đơn. Xem ở
        mục "Tin đăng sàn".
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={() => run(true)}>
          <Store className="size-4" /> Xem trước
        </Button>
        <Button variant="secondary" disabled={busy || !res?.dryRun} onClick={() => run(false)}>
          Đồng bộ tin đăng
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {res && (
        <p className="mt-3 text-sm">
          {res.dryRun ? 'Xem trước: ' : 'Đã chạy: '}
          {fmt(res.listings)} tin Việt Nam ({fmt(res.skippedOtherCountry)} tin PH/MY bỏ qua
          {res.removedOtherCountry > 0
            ? `, ${fmt(res.removedOtherCountry)} tin PH/MY đã lưu trước đó ${res.dryRun ? 'sẽ bị xóa' : 'đã xóa'}`
            : ''}
          ): ({fmt(res.created)} mới, {fmt(res.updated)} đã có), {fmt(res.variations)} biến thể. Nối được{' '}
          {fmt(matched)} (link {fmt(res.matched.link)}, mã hàng {fmt(res.matched.sku)}, mã vạch{' '}
          {fmt(res.matched.barcode)}, học từ đơn {fmt(res.matched.orders)}), chưa nối {fmt(res.unmatched)}.
          {res.unmatchedSkus.length > 0 && (
            <span className="block text-xs text-slate-500">
              SKU sàn chưa nối (mẫu): {res.unmatchedSkus.slice(0, 8).join(', ')}
            </span>
          )}
        </p>
      )}
    </Card>
  );
}
