'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';

interface Warehouse {
  id: string;
  name?: string | null;
}
interface Plan {
  dryRun: boolean;
  warehouse: Warehouse;
  existing: { sku: string; pancakeStock: number | null }[];
  missing: string[];
}
interface Sync {
  dryRun: boolean;
  warehouse: Warehouse;
  rows: { sku: string; sugami: number; pancakeBefore: number | null; pancakeAfter?: number | null }[];
  missing: string[];
}
interface Created {
  created: { sku: string; pancakeStock: number | null }[];
  notFoundAfterCreate: string[];
}

type ErrorBody = { message: string; warehouses?: Warehouse[] };

/** Trial tool: push one product (or just its stock) to Pancake. Always previews before writing. */
export function PancakePush({ code, onClose }: { code: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sync, setSync] = useState<Sync | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const call = async <T,>(path: 'push' | 'stock', dryRun: boolean): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pancake/products/${encodeURIComponent(code)}/${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, ...(warehouseId ? { warehouseId } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as T & Partial<ErrorBody>;
      if (!res.ok) {
        // The API lists the Pancake warehouses when it cannot choose one.
        if (body.warehouses) setWarehouses(body.warehouses);
        setError(body.message ?? `Lỗi ${res.status}`);
        return null;
      }
      return body;
    } catch {
      setError('Không gọi được máy chủ');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setResult(null);
    setPlan(null);
    setSync(null);
    setPlan(await call<Plan>('push', true));
  };
  const previewSync = async () => {
    setResult(null);
    setPlan(null);
    setSync(null);
    setSync(await call<Sync>('stock', true));
  };
  const confirmCreate = async () => {
    const r = await call<Created>('push', false);
    if (!r) return;
    setPlan(null);
    setResult(
      `Đã tạo trên Pancake: ${r.created.map((c) => `${c.sku} (tồn ${c.pancakeStock ?? '?'})`).join(', ')}.` +
        (r.notFoundAfterCreate.length ? ` Chưa thấy lại: ${r.notFoundAfterCreate.join(', ')}.` : '') +
        ' Giờ liên kết với listing Shopee trên Pancake rồi thử đổi tồn.',
    );
  };
  const confirmSync = async () => {
    const r = await call<Sync>('stock', false);
    if (!r) return;
    setSync(null);
    setResult(
      `Đã cập nhật tồn Pancake: ${r.rows.map((x) => `${x.sku} ${x.pancakeBefore ?? '?'} → ${x.pancakeAfter ?? '?'}`).join(', ')}.`,
    );
  };

  return (
    <Card className="mb-4 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Đẩy sang Pancake (thử 1 sản phẩm)</h2>
        <Button variant="ghost" onClick={onClose}>
          Đóng
        </Button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Luôn xem trước rồi mới ghi. Mã hàng (SKU) giữ nguyên làm mã trên Pancake; tồn lấy từ Sugami.
      </p>
      {warehouses.length > 1 && (
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="mb-3 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="">Chọn kho Pancake</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name ?? w.id}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={preview}>
          Xem trước: tạo sản phẩm
        </Button>
        <Button variant="secondary" disabled={busy} onClick={previewSync}>
          Xem trước: đồng bộ tồn
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {result && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{result}</p>}
      {plan && (
        <div className="mt-3 text-sm">
          <p>
            Sẽ tạo {plan.missing.length} mã vào kho <b>{plan.warehouse.name ?? plan.warehouse.id}</b>:{' '}
            {plan.missing.join(', ') || '–'}
          </p>
          {plan.existing.length > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Đã có trên Pancake: {plan.existing.map((e) => e.sku).join(', ')}. Không tạo lại; dùng đồng bộ
              tồn.
            </p>
          )}
          <Button className="mt-3" disabled={busy || plan.existing.length > 0} onClick={confirmCreate}>
            Xác nhận tạo trên Pancake
          </Button>
        </div>
      )}
      {sync && (
        <div className="mt-3 text-sm">
          <p>
            Kho <b>{sync.warehouse.name ?? sync.warehouse.id}</b>:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {sync.rows.map((r) => (
              <li key={r.sku}>
                {r.sku}: Pancake {r.pancakeBefore ?? '?'} → Sugami {r.sugami}
              </li>
            ))}
          </ul>
          {sync.missing.length > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Chưa có trên Pancake (bỏ qua): {sync.missing.join(', ')}
            </p>
          )}
          <Button className="mt-3" disabled={busy || sync.rows.length === 0} onClick={confirmSync}>
            Xác nhận cập nhật tồn Pancake
          </Button>
        </div>
      )}
    </Card>
  );
}
