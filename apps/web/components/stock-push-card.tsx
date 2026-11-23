'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeDateTime } from '@/lib/datetime';

interface Status {
  on: boolean;
  lastRunAt: string | null;
  ordersSyncedAt: string | null;
  ordersCaughtUp: boolean;
  onPancake: number;
  pending: number;
}
interface Compare {
  onPancake: number;
  different: number;
  fixed: number;
  failed: { sku: string; message: string }[];
  sample: { sku: string; sugami: number; pancake: number | null }[];
}
interface Run {
  changed: number;
  pushed: number;
  failed: { sku: string; message: string }[];
  sample: { sku: string; qty: number; previous: string | null }[];
}

/** Settings card: turn the automatic stock push (Sugami → Pancake → marketplaces) on or off and run it by hand. */
export function StockPushCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [run, setRun] = useState<(Run & { dryRun: boolean }) | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  const load = useCallback(() => {
    api<Status>('/pancake/stock-push/status')
      .then(setSt)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      load();
    }
  };

  const toggle = (on: boolean) =>
    act('toggle', async () => {
      await api('/pancake/stock-push/toggle', { method: 'POST', json: { on } });
    });
  const doCompare = (apply: boolean) =>
    act(apply ? 'apply' : 'compare', async () => {
      setConfirmApply(false);
      setCompare(await api<Compare>('/pancake/stock-push/compare', { method: 'POST', json: { apply } }));
    });
  const doRun = (dryRun: boolean) =>
    act(dryRun ? 'preview' : 'run', async () => {
      const r = await api<Run>('/pancake/stock-push/run', { method: 'POST', json: { dryRun } });
      setRun({ ...r, dryRun });
    });

  return (
    <Card className="space-y-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">Đẩy tồn lên Pancake, rồi lên sàn</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Khi tồn Sugami đổi (bán, nhập, kiểm kho, đơn mới từ sàn), tồn bán được tự cập nhật lên Pancake.
            Chỉ đẩy khi đã kéo hết đơn mới, và chỉ một nơi đẩy tồn lên sàn: tắt đồng bộ tồn bên KiotViet trước
            khi bật.
          </p>
        </div>
        {st && (
          <div className="flex items-center gap-2">
            <Badge tone={st.on ? 'success' : 'warn'}>{st.on ? 'Đang bật' : 'Đang tắt'}</Badge>
            <Button
              variant={st.on ? 'secondary' : 'primary'}
              disabled={busy !== null}
              onClick={() => toggle(!st.on)}
            >
              {st.on ? 'Tạm tắt' : 'Bật tự động đẩy tồn'}
            </Button>
          </div>
        )}
      </div>
      {st && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              ['Mã đã có trên Pancake', st.onPancake.toLocaleString('vi-VN')],
              ['Mã đang chờ đẩy', st.pending.toLocaleString('vi-VN')],
              ['Lần chạy tự động gần nhất', st.lastRunAt ? formatRelativeDateTime(st.lastRunAt) : 'chưa có'],
              [
                'Đơn Pancake kéo về lần cuối',
                st.ordersSyncedAt ? formatRelativeDateTime(st.ordersSyncedAt) : 'chưa có',
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/5">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
            </div>
          ))}
          {!st.ordersCaughtUp && (
            <p className="col-span-full text-xs text-amber-600">Chưa kéo kịp đơn mới, tự động đẩy sẽ chờ.</p>
          )}
        </dl>
      )}
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Lần đầu</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy !== null} onClick={() => doCompare(false)}>
              1. Xem chênh lệch với Pancake
            </Button>
            {confirmApply ? (
              <>
                <Button disabled={busy !== null} onClick={() => doCompare(true)}>
                  Chắc chắn: đặt Pancake theo Sugami
                </Button>
                <Button variant="ghost" onClick={() => setConfirmApply(false)}>
                  Hủy
                </Button>
              </>
            ) : (
              <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmApply(true)}>
                2. Đặt tồn Pancake theo Sugami (tất cả)
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Bấm 1 để xem, 2 để đồng bộ cả cửa hàng (tồn Sugami đè lên Pancake), rồi mới bật tự động.
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Thay đổi chờ đẩy</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy !== null} onClick={() => doRun(true)}>
              Xem thay đổi chờ đẩy
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => doRun(false)}>
              Đẩy thay đổi ngay
            </Button>
          </div>
        </div>
      </div>
      {busy && <p className="text-sm text-slate-500">Đang chạy… có thể mất vài phút với hàng nghìn mã.</p>}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {compare && (
        <div className="mt-3 text-sm">
          <p>
            {compare.different.toLocaleString('vi-VN')}/{compare.onPancake.toLocaleString('vi-VN')} mã lệch
            tồn
            {compare.fixed > 0 && `, đã sửa ${compare.fixed.toLocaleString('vi-VN')}`}
            {compare.failed.length > 0 &&
              `, ${compare.failed.length} lỗi (${compare.failed[0]!.sku}: ${compare.failed[0]!.message})`}
            .
          </p>
          {compare.sample.length > 0 && (
            <table className="mt-2 w-full max-w-md text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th>Mã hàng</th>
                  <th className="text-right">Sugami</th>
                  <th className="text-right">Pancake</th>
                </tr>
              </thead>
              <tbody>
                {compare.sample.slice(0, 20).map((d) => (
                  <tr key={d.sku}>
                    <td className="font-mono">{d.sku}</td>
                    <td className="text-right tabular-nums">{d.sugami}</td>
                    <td className="text-right tabular-nums">{d.pancake ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {run && (
        <p className="mt-3 text-sm">
          {run.dryRun ? 'Xem trước: ' : 'Đã đẩy: '}
          {run.dryRun ? `${run.changed} mã sẽ được đẩy` : `${run.pushed}/${run.changed} mã`}
          {run.failed.length > 0 &&
            `, ${run.failed.length} lỗi (${run.failed[0]!.sku}: ${run.failed[0]!.message})`}
          {run.sample.length > 0 &&
            ` (mẫu: ${run.sample
              .slice(0, 6)
              .map((s) => `${s.sku} → ${s.qty}`)
              .join(', ')})`}
          .
        </p>
      )}
    </Card>
  );
}
