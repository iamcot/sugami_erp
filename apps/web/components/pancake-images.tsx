'use client';

import { ImageDown } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';

interface Result {
  dryRun: boolean;
  listings: number;
  listingSkus: number;
  matched: number;
  matchedByBarcode: number;
  updated: number;
  keptExisting: number;
  unknownSkus: string[];
}

/** Fill product images from the Shopee/TikTok listings Pancake pulled, matched by seller SKU. */
interface Mirror {
  pending: number;
  stored: number;
  reused: number;
  remaining: number;
  nextAfter: string | null;
  failed: { sku: string; url: string; reason: string }[];
}

export function PancakeImages() {
  const [mirror, setMirror] = useState<{
    done: number;
    stored: number;
    failed: Mirror['failed'];
    total: number;
  } | null>(null);
  const [mirroring, setMirroring] = useState(false);

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

  const mirrorAll = async () => {
    setMirroring(true);
    setError(null);
    let after: string | undefined;
    let first = true;
    const acc = { done: 0, stored: 0, failed: [] as Mirror['failed'], total: 0 };
    try {
      for (;;) {
        const r = await fetch('/api/media/mirror-variant-images', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun: false, limit: 40, afterSku: after }),
        });
        const b = (await r.json().catch(() => ({}))) as Mirror & { message?: string };
        if (!r.ok) throw new Error(b.message ?? `Lỗi ${r.status}`);
        if (first) {
          acc.total = b.pending;
          first = false;
        }
        acc.stored += b.stored;
        acc.failed.push(...b.failed);
        acc.done = acc.total - b.remaining;
        setMirror({ ...acc });
        if (b.remaining <= 0 || !b.nextAfter) break;
        after = b.nextAfter;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMirroring(false);
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="text-sm font-medium">Ảnh sản phẩm từ sàn</h2>
      <p className="mt-1 text-xs text-slate-500">
        Lấy ảnh từ các tin đăng Shopee/TikTok mà Pancake đã kéo về, nối với sản phẩm theo SKU người bán (cùng
        mã hàng KiotViet). Sau khi lấy URL, bấm "Lưu ảnh về kho (S3)" để tải file về kho lưu trữ của shop (làm
        theo lô, có thể chạy lại).
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
        <Button variant="secondary" disabled={mirroring} onClick={mirrorAll}>
          Lưu ảnh về kho (S3)
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {mirror && (
        <p className="mt-3 text-sm">
          Đã lưu ảnh cho {mirror.done.toLocaleString('vi-VN')}/{mirror.total.toLocaleString('vi-VN')} biến thể
          ({mirror.stored.toLocaleString('vi-VN')} file mới){mirroring && ' …đang chạy'}
          {mirror.failed.length > 0 && (
            <span className="block text-xs text-rose-600">
              {mirror.failed.length} ảnh lỗi, ví dụ {mirror.failed[0]!.sku}: {mirror.failed[0]!.reason}. Bấm
              lại để thử lại.
            </span>
          )}
        </p>
      )}
      {res && (
        <p className="mt-3 text-sm">
          {res.dryRun ? 'Xem trước: ' : 'Đã chạy: '}
          {res.listings.toLocaleString('vi-VN')} tin đăng, {res.listingSkus.toLocaleString('vi-VN')} SKU có
          ảnh, khớp {res.matched.toLocaleString('vi-VN')} mã hàng trong Sugami (
          {res.matchedByBarcode.toLocaleString('vi-VN')} khớp theo mã vạch),{' '}
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
