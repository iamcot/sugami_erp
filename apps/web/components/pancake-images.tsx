'use client';

import { ImageDown } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';

interface Result {
  dryRun: boolean;
  listings: number;
  listingSkus: number;
  matched: number;
  updated: number;
  keptExisting: number;
  unknownSkus: string[];
}

/** Fill product images from the Shopee/TikTok listings Pancake pulled, matched by seller SKU. */
export function PancakeImages() {
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/pancake/sync-images', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, replace }),
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

  return (
    <Card className="mb-4 p-4">
      <h2 className="text-sm font-medium">Ảnh sản phẩm từ sàn</h2>
      <p className="mt-1 text-xs text-slate-500">
        Lấy ảnh từ các tin đăng Shopee/TikTok mà Pancake đã kéo về, nối với sản phẩm theo SKU người bán (cùng
        mã hàng KiotViet). Dùng URL ảnh của sàn, chưa sao chép về kho lưu trữ.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Thay cả ảnh đã có (từ file KiotViet)
        </label>
        <Button disabled={busy} onClick={() => run(true)}>
          <ImageDown className="size-4" /> Xem trước
        </Button>
        <Button variant="secondary" disabled={busy || !res?.dryRun} onClick={() => run(false)}>
          Lấy ảnh
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {res && (
        <p className="mt-3 text-sm">
          {res.dryRun ? 'Xem trước: ' : 'Đã chạy: '}
          {res.listings.toLocaleString('vi-VN')} tin đăng, {res.listingSkus.toLocaleString('vi-VN')} SKU có
          ảnh, khớp {res.matched.toLocaleString('vi-VN')} mã hàng trong Sugami,{' '}
          {res.dryRun ? 'sẽ cập nhật' : 'đã cập nhật'} {res.updated.toLocaleString('vi-VN')}, giữ ảnh cũ{' '}
          {res.keptExisting.toLocaleString('vi-VN')}.
          {res.unknownSkus.length > 0 && (
            <span className="block text-xs text-slate-500">
              SKU trên sàn chưa có trong Sugami (mẫu): {res.unknownSkus.slice(0, 8).join(', ')}
            </span>
          )}
        </p>
      )}
    </Card>
  );
}
