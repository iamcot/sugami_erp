'use client';

import { Link2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';

interface Group {
  key: string;
  name: string;
  lines: number;
  orders: number;
  qty: number;
  lastOrderedAt: string;
  unitPrice: number;
}
interface VariantHit {
  id: string;
  sku: string;
  barcode: string | null;
  price: number;
  productName: string;
  optionValues: unknown;
}

const fmt = (n: number) => n.toLocaleString('vi-VN');
const optionText = (v: unknown) =>
  v && typeof v === 'object' ? Object.values(v as Record<string, unknown>).join(' / ') : '';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init });
  const body = (await r.json().catch(() => ({}))) as T & { message?: string };
  if (!r.ok) throw new Error(body.message ?? `Lỗi ${r.status}`);
  return body;
}

function Row({ g, onDone }: { g: Group; onDone: (msg: string) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<VariantHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) return setHits([]);
    try {
      const r = await call<{ data: VariantHit[] }>(`/api/pancake/variant-search?q=${encodeURIComponent(text)}`);
      setHits(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const link = async (v: VariantHit) => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ lines: number; orders: number; stockApplied: number; stockBeforeSnapshot: number }>(
        '/api/pancake/link-line',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: g.key, variantId: v.id }),
        },
      );
      onDone(
        `${g.key} → ${v.sku}: ${fmt(r.lines)} dòng / ${fmt(r.orders)} đơn, trừ tồn ${fmt(r.stockApplied)} dòng` +
          (r.stockBeforeSnapshot ? `, ${fmt(r.stockBeforeSnapshot)} dòng bán trước mốc tồn nên không trừ` : ''),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="font-mono text-xs text-slate-500">{g.key}</span>
        <span className="font-medium">{g.name}</span>
        <span className="text-xs text-slate-500">
          {fmt(g.orders)} đơn · SL {fmt(g.qty)} · {fmt(g.unitPrice)} đ
        </span>
      </div>
      <input
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Tìm mã hàng Sugami (mã, mã vạch hoặc tên) để ghép"
        className="mt-2 w-full max-w-md rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
      />
      {hits.length > 0 && (
        <ul className="mt-1 max-w-xl divide-y divide-slate-100 rounded-md border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
          {hits.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span>
                <span className="font-mono text-xs">{v.sku}</span> {v.productName}
                <span className="text-xs text-slate-500"> {optionText(v.optionValues)} · {fmt(v.price)} đ</span>
              </span>
              <Button variant="secondary" disabled={busy} onClick={() => link(v)}>
                <Link2 className="size-3.5" /> Ghép
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
    </li>
  );
}

/** Marketplace codes Pancake did not link: pick the Sugami variant once and every order follows. */
export function PancakeUnlinked() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setGroups((await call<{ data: Group[] }>('/api/pancake/unlinked-lines')).data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="mb-4 p-4">
      <h2 className="text-sm font-medium">Dòng hàng chưa liên kết</h2>
      <p className="mt-1 text-xs text-slate-500">
        Dòng hàng trong đơn mà Pancake chưa nối với sản phẩm (chỉ có mã sàn). Chọn mã hàng Sugami có sẵn một
        lần: các đơn đang có và đơn sau này của mã sàn đó tự nhận mã hàng, tồn được trừ theo quy tắc thường
        (đơn sau mốc tồn đầu của mã hàng).
      </p>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {done.map((d) => (
        <p key={d} className="mt-2 text-sm text-emerald-700">
          Đã ghép {d}
        </p>
      ))}
      {groups && groups.length === 0 && <p className="mt-3 text-sm text-slate-500">Không còn dòng nào chưa liên kết.</p>}
      {groups && groups.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {groups.map((g) => (
            <Row
              key={g.key}
              g={g}
              onDone={(m) => {
                setDone((d) => [m, ...d]);
                void load();
              }}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
