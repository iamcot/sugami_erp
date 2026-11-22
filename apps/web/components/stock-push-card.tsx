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
    <Card className="mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Đẩy tồn lên Pancake (rồi lên sàn)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Khi tồn Sugami đổi (bán, nhập, kiểm kho, đơn mới từ sàn), tồn bán được (trừ hàng đang giữ cho đơn
            giao) tự cập nhật lên Pancake; Pancake đẩy tiếp cho tin đăng đã liên kết. Chỉ đẩy khi đã kéo hết
            đơn mới và chỉ một nơi đẩy tồn lên sàn: tắt đồng bộ tồn bên KiotViet trước khi bật.
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
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {st.onPancake.toLocaleString('vi-VN')} mã đã có trên Pancake · {st.pending.toLocaleString('vi-VN')}{' '}
          mã đang chờ đẩy · lần chạy tự động gần nhất:{' '}
          {st.lastRunAt ? formatRelativeDateTime(st.lastRunAt) : 'chưa có'} · đơn Pancake kéo về lần cuối:{' '}
          {st.ordersSyncedAt ? formatRelativeDateTime(st.ordersSyncedAt) : 'chưa có'}
          {!st.ordersCaughtUp && <span className="text-amber-600"> (chưa kịp, tự động đẩy sẽ chờ)</span>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
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
        <Button variant="secondary" disabled={busy !== null} onClick={() => doRun(true)}>
          Xem thay đổi chờ đẩy
        </Button>
        <Button variant="secondary" disabled={busy !== null} onClick={() => doRun(false)}>
          Đẩy thay đổi ngay
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Lần đầu: bấm 1 để xem, 2 để đồng bộ cả cửa hàng (ghi tồn Sugami đè lên Pancake), rồi mới bật tự động.
      </p>
      {busy && (
        <p className="mt-2 text-sm text-slate-500">Đang chạy… có thể mất vài phút với hàng nghìn mã.</p>
      )}
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
