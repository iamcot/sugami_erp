'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { KiotVietTabs } from '@/components/kiotviet-tabs';
import { Badge, Button, Card, PageHeader } from '@/components/ui';

interface Summary {
  dryRun: boolean;
  since: string;
  fetched: number;
  skipped: { currency: number; channel: number };
  created: number;
  updated: number;
  unchanged: number;
  keptFromKiotViet: number;
  enriched: number;
  customers: { created: number; linked: number };
  stock: { applied: number; beforeSnapshot: number; reversed: number };
  unknownSkus: string[];
  unlinkedLines: number;
  newOrders: { code: string; channel: string; total: number }[];
  errors: { code: string; message: string }[];
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function PancakePage() {
  const [sinceDays, setSinceDays] = useState(14);
  const [rescan, setRescan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Summary | null>(null);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/pancake/sync-orders', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, sinceDays, rescan }),
      });
      const body = (await r.json().catch(() => ({}))) as Summary & { message?: string };
      if (!r.ok) throw new Error(body.message ?? `Lỗi ${r.status}`);
      setRes(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="KiotViet"
        description="Đồng bộ đơn từ Pancake (Shopee VN, TikTok). Worker tự chạy mỗi 5 phút; trang này để xem trước hoặc chạy ngay."
      />
      <KiotVietTabs />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="text-xs text-slate-500">
          Số ngày quét lùi
          <input
            type="number"
            min={1}
            max={1500}
            value={sinceDays}
            onChange={(e) => setSinceDays(Math.min(1500, Math.max(1, Number(e.target.value) || 14)))}
            className="mt-1 block h-9 w-28 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900"
          />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={rescan} onChange={(e) => setRescan(e.target.checked)} />
          Quét lại từ {sinceDays} ngày trước (bỏ qua con trỏ, dùng để cập nhật đơn cũ)
        </label>
        <Button disabled={busy} onClick={() => run(true)}>
          <RefreshCw className="size-4" /> Xem trước
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !res?.dryRun}
          onClick={() => run(false)}
          title={res?.dryRun ? undefined : 'Xem trước trước khi chạy thật'}
        >
          Chạy thật
        </Button>
      </Card>
      {busy && <p className="text-sm text-slate-500">Đang xử lý…</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {res && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {res.dryRun ? 'Xem trước (chưa ghi gì)' : 'Đã chạy xong'}: {fmt(res.fetched)} đơn từ Pancake
            </span>
            {res.errors.length > 0 && <Badge tone="danger">{res.errors.length} lỗi</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Đơn mới" value={fmt(res.created)} />
            <Stat label="Cập nhật" value={fmt(res.updated)} hint={`${fmt(res.unchanged)} giữ nguyên`} />
            <Stat
              label="Đã có từ KiotViet"
              value={fmt(res.keptFromKiotViet)}
              hint="Giữ nguyên, không trừ tồn lần nữa"
            />
            <Stat
              label="Đơn KiotViet được bổ sung"
              value={fmt(res.enriched)}
              hint="Thêm đơn vị vận chuyển, mã vận đơn, khách"
            />
            <Stat
              label="Khách"
              value={`${fmt(res.customers.created)} mới`}
              hint={`${fmt(res.customers.linked)} đơn/khách được gắn`}
            />
            <Stat
              label="Bỏ qua"
              value={fmt(res.skipped.currency + res.skipped.channel)}
              hint={`${fmt(res.skipped.currency)} khác VND (MY/PH) · ${fmt(res.skipped.channel)} kênh khác`}
            />
            <Stat
              label="Trừ tồn"
              value={`${fmt(res.stock.applied)} dòng`}
              hint={`${fmt(res.stock.beforeSnapshot)} dòng trước lần nhập tồn, không trừ`}
            />
            <Stat label="Hoàn tồn do hủy" value={`${fmt(res.stock.reversed)} dòng`} />
            <Stat
              label="Mã hàng chưa có"
              value={fmt(res.unknownSkus.length)}
              hint={res.unknownSkus.slice(0, 5).join(', ')}
            />
            <Stat
              label="Dòng hàng chưa liên kết"
              value={fmt(res.unlinkedLines)}
              hint="Tin đăng chưa nối sản phẩm Pancake, không trừ tồn"
            />
          </div>
          {res.newOrders.length > 0 && (
            <ul className="mt-4 max-h-64 list-disc overflow-auto pl-5 text-sm">
              {res.newOrders.map((o) => (
                <li key={o.code}>
                  <span className="font-mono text-xs">{o.code}</span> · {o.channel} · {fmt(o.total)} đ
                </li>
              ))}
            </ul>
          )}
          {res.errors.map((e) => (
            <p key={e.code} className="mt-2 text-sm text-rose-600">
              {e.code}: {e.message}
            </p>
          ))}
          {res.fetched === 0 && (
            <p className="mt-3 text-sm text-slate-500">
              Pancake chưa trả đơn nào từ {new Date(res.since).toLocaleString('vi-VN')}.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
