'use client';

import { CarrierLogo } from '@/components/carrier-logo';
import { formatVnd } from '@sugami/shared';
import { Copy, ExternalLink, Printer, Truck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeDateTime } from '@/lib/datetime';

interface Shipment {
  id: string;
  partnerCode: string;
  partnerName: string | null;
  serviceName: string | null;
  partnerTrackNo: string | null;
  trackId: string | null;
  status: string;
  phase: string;
  feeTotal: number;
  quotedPrice: number;
  codAmount: number;
  payee: string;
  trackLink: string | null;
  partnerTrackLink: string | null;
  livemode: boolean;
  error: string | null;
  events: {
    status: string;
    statusName: string | null;
    note: string | null;
    location: string | null;
    occurredAt: string;
  }[];
}
interface Quote {
  serviceId: string;
  serviceName: string;
  partnerId: string;
  partnerName: string;
  group: 'standard' | 'fast';
  price: number;
  etaText: string | null;
  etaMinutes: number | null;
  available: boolean;
  unavailableReason: string | null;
  cheapest: boolean;
  fastest: boolean;
}
interface QuoteResult {
  data: Quote[];
  warnings: string[];
  parcel: { grams: number; boxKey: string; boxLabel: string; unknownWeights: number };
  preferredStandard: string;
  codAmount: number;
}
interface Settings {
  boxes: { key: string; label: string }[];
}

const PHASE: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warn' | 'danger' }> = {
  waiting: { label: 'Chờ hãng lấy hàng', tone: 'brand' },
  picked_up: { label: 'Đang giao', tone: 'warn' },
  delivered: { label: 'Đã giao', tone: 'success' },
  canceled: { label: 'Đã hủy', tone: 'neutral' },
  returning: { label: 'Đang hoàn', tone: 'danger' },
  returned: { label: 'Đã hoàn về shop', tone: 'danger' },
  failed_attempt: { label: 'Giao lỗi, sẽ giao lại', tone: 'danger' },
};
const ACTIVE = ['waiting', 'picked_up', 'returning', 'failed_attempt'];
const dt = (s: string) => formatRelativeDateTime(s);

function eta(q: Quote): string | null {
  if (q.etaText) return q.etaText;
  if (q.etaMinutes == null) return null;
  return q.etaMinutes < 120 ? `${q.etaMinutes} phút` : `${Math.round(q.etaMinutes / 60)} giờ`;
}

/** Waybill of a self-delivered counter order: create from a price table, track, print, cancel. */
export function ShippingPanel({
  order,
  onChanged,
  autoOpen = false,
}: {
  order: {
    code: string;
    source: string;
    fulfillment: string | null;
    status: string;
    codAmount: number;
    carrier: string | null;
    trackingNo: string | null;
    trackingUrl: string | null;
    shippingStatus: string | null;
    shippingFee: number;
  };
  onChanged: () => void;
  /** Open the price table as soon as the order can take a waybill (right after a delivery order is made). */
  autoOpen?: boolean;
}) {
  const [list, setList] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<{ data: Shipment[] }>(`/orders/${encodeURIComponent(order.code)}/shipments`)
      .then((r) => setList(r.data))
      .catch(() => setList([]));
  }, [order.code]);
  useEffect(load, [load, order.status]);

  const isDelivery = order.source === 'pos' && order.fulfillment === 'delivery';
  const active = list?.find((s) => ACTIVE.includes(s.phase) || s.phase === 'delivered');
  const canCreate = isDelivery && ['new', 'confirmed', 'packing'].includes(order.status) && !active;
  // an Ahamove trip is booked directly (not a Shipment row): it follows the order's own carrier fields
  const ahamove = !active && order.carrier === 'Ahamove' && order.trackingNo ? order : null;
  const opened = useRef(false);
  useEffect(() => {
    if (autoOpen && list && canCreate && !opened.current) {
      opened.current = true;
      setCreating(true);
    }
  }, [autoOpen, list, canCreate]);
  if (!list || (!active && !ahamove && !canCreate && list.length === 0)) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const label = (s: Shipment) =>
    run(async () => {
      const r = await api<{ url: string }>(`/shipments/${s.id}/label`);
      window.open(r.url, '_blank', 'noopener');
    });
  const cancel = (s: Shipment) => {
    if (!window.confirm(`Hủy vận đơn ${s.partnerTrackNo ?? s.trackId ?? ''}? Hãng sẽ không đến lấy hàng.`))
      return;
    return run(async () => void (await api(`/shipments/${s.id}/cancel`, { method: 'POST' })));
  };

  return (
    <>
      {error && <p className="mb-2 text-sm text-rose-600">{error}</p>}
      {ahamove ? (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <CarrierLogo id="ahamove" name="AhaMove" className="size-7" />
            <span className="font-semibold">Ahamove</span>
            <Badge tone={order.status === 'delivered' || order.status === 'completed' ? 'success' : 'warn'}>
              {order.shippingStatus ?? 'Đang giao'}
            </Badge>
            <span className="flex-1" />
            {order.status === 'shipped' && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () =>
                        void (await api(`/pos/orders/${encodeURIComponent(order.code)}/ahamove/refresh`, {
                          method: 'POST',
                          json: {},
                        })),
                    )
                  }
                >
                  Cập nhật trạng thái
                </Button>
                <Button
                  variant="secondary"
                  className="text-rose-600"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('Hủy chuyến Ahamove này? Chỉ hủy được trước khi tài xế lấy hàng.'))
                      return;
                    void run(
                      async () =>
                        void (await api(`/pos/orders/${encodeURIComponent(order.code)}/ahamove/cancel`, {
                          method: 'POST',
                          json: {},
                        })),
                    );
                  }}
                >
                  Hủy chuyến
                </Button>
              </>
            )}
          </div>
          <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <span className="text-slate-500">Mã chuyến: </span>
              <span className="font-mono">{order.trackingNo}</span>
            </div>
            {order.shippingFee > 0 && (
              <div>
                <span className="text-slate-500">Phí giao hàng: </span>
                <span className="font-mono">{formatVnd(order.shippingFee)}</span>
              </div>
            )}
            {order.trackingUrl && (
              <div>
                <a
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Xem tài xế trên bản đồ <ExternalLink className="size-3.5" />
                </a>
              </div>
            )}
          </div>
        </Card>
      ) : active ? (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <CarrierLogo id={active.partnerCode} name={active.partnerName} className="size-7" />
            <span className="font-semibold">
              {active.partnerName ?? active.partnerCode}
              {active.serviceName ? ` · ${active.serviceName}` : ''}
            </span>
            <Badge tone={(PHASE[active.phase] ?? PHASE.waiting!).tone}>
              {(PHASE[active.phase] ?? PHASE.waiting!).label}
            </Badge>
            {!active.livemode && <Badge tone="warn">THỬ</Badge>}
            <span className="flex-1" />
            <Button variant="secondary" disabled={busy} onClick={() => void label(active)}>
              <Printer className="size-4" /> In vận đơn
            </Button>
            {active.phase === 'waiting' && (
              <Button
                variant="secondary"
                className="text-rose-600"
                disabled={busy}
                onClick={() => void cancel(active)}
              >
                Hủy vận đơn
              </Button>
            )}
          </div>
          <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <span className="text-slate-500">Mã vận đơn: </span>
              <span className="font-mono">{active.partnerTrackNo ?? active.trackId ?? '—'}</span>
              {(active.partnerTrackNo ?? active.trackId) && (
                <button
                  className="ml-1 align-middle text-slate-400 hover:text-slate-700"
                  title="Sao chép mã"
                  onClick={() =>
                    void navigator.clipboard?.writeText(active.partnerTrackNo ?? active.trackId ?? '')
                  }
                >
                  <Copy className="inline size-3.5" />
                </button>
              )}
            </div>
            <div>
              <span className="text-slate-500">Phí giao hàng: </span>
              <span className="font-mono">{formatVnd(active.feeTotal || active.quotedPrice)}</span>{' '}
              <span className="text-slate-500">({active.payee === 'sender' ? 'shop trả' : 'khách trả'})</span>
            </div>
            {active.codAmount > 0 && (
              <div>
                <span className="text-slate-500">Thu hộ (COD): </span>
                <span className="font-mono">{formatVnd(active.codAmount)}</span>
              </div>
            )}
            {(active.trackLink ?? active.partnerTrackLink) && (
              <div>
                <a
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  href={(active.partnerTrackLink ?? active.trackLink)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  Link tra cứu gửi khách <ExternalLink className="size-3.5" />
                </a>
              </div>
            )}
          </div>
          {active.error && <p className="mt-2 text-xs text-rose-600">{active.error}</p>}
          {active.events.length > 0 && (
            <ol className="mt-3 space-y-1 border-t border-slate-200/70 pt-3 text-sm dark:border-white/10">
              {active.events.slice(0, 8).map((e, i) => (
                <li key={`${e.occurredAt}-${i}`} className="flex gap-3">
                  <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{dt(e.occurredAt)}</span>
                  <span>
                    {e.statusName ?? e.status}
                    {e.location ? ` · ${e.location}` : ''}
                    {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : (
        canCreate && (
          <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
            <Truck className="size-4 text-slate-500" />
            <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">
              Đơn giao hàng chưa có vận đơn. Xem giá các hãng và tạo vận đơn, hãng sẽ đến lấy hàng.
            </span>
            <Button onClick={() => setCreating(true)}>Tạo vận đơn</Button>
          </Card>
        )
      )}
      {creating && (
        <CreateDialog
          order={order}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

/** The price table: tabs Giao thường / Giao nhanh, cheapest and fastest marked, pick a row and confirm. */
function CreateDialog({
  order,
  onClose,
  onDone,
}: {
  order: { code: string; codAmount: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const [boxes, setBoxes] = useState<Settings['boxes']>([]);
  const [boxKey, setBoxKey] = useState<string | undefined>();
  const [addFee, setAddFee] = useState(false);
  const [res, setRes] = useState<QuoteResult | null>(null);
  const [tab, setTab] = useState<'standard' | 'fast'>('standard');
  const [picked, setPicked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Settings>('/shipping/settings')
      .then((s) => setBoxes(s.boxes))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    setLoading(true);
    setError(null);
    api<QuoteResult>(`/orders/${encodeURIComponent(order.code)}/shipping-quotes`, {
      method: 'POST',
      json: { boxKey, addFeeToOrder: false },
    })
      .then((r) => {
        setRes(r);
        setBoxKey((k) => k ?? r.parcel.boxKey);
        setPicked(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [order.code, boxKey]);

  const rows = (res?.data ?? []).filter((r) => r.group === tab);
  // preselect: SPX (or the preferred carrier) for normal parcels, the cheapest for same-day
  const auto =
    tab === 'standard'
      ? (rows.find((r) => r.available && r.partnerId === res?.preferredStandard) ??
        rows.find((r) => r.available && r.cheapest))
      : rows.find((r) => r.available && r.cheapest);
  const chosen = rows.find((r) => r.serviceId === picked) ?? auto ?? null;
  const counts = {
    standard: (res?.data ?? []).filter((r) => r.group === 'standard').length,
    fast: (res?.data ?? []).filter((r) => r.group === 'fast').length,
  };

  const submit = async () => {
    if (!chosen) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/orders/${encodeURIComponent(order.code)}/shipments`, {
        method: 'POST',
        json: { serviceId: chosen.serviceId, quotedPrice: chosen.price, boxKey, addFeeToOrder: addFee },
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Tạo vận đơn · {order.code}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="text-slate-500">
            Hộp{' '}
            <select
              className="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
              value={boxKey ?? ''}
              onChange={(e) => setBoxKey(e.target.value)}
            >
              {boxes.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          {res && (
            <span className="text-slate-500">
              Cân nặng ước tính {(res.parcel.grams / 1000).toLocaleString('vi-VN')} kg
              {res.parcel.unknownWeights > 0 && ` (${res.parcel.unknownWeights} sản phẩm chưa có cân nặng)`}
            </span>
          )}
        </div>
        <Tabs
          className="mt-3"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPicked(null);
          }}
          items={[
            { id: 'standard', label: 'Giao thường', count: counts.standard },
            { id: 'fast', label: 'Giao nhanh', count: counts.fast },
          ]}
        />
        <div className="mt-3 min-h-40 flex-1 overflow-y-auto rounded-md border border-slate-200 dark:border-white/10">
          {loading && <p className="p-4 text-sm text-slate-500">Đang lấy giá các hãng…</p>}
          {!loading && rows.length === 0 && !error && (
            <p className="p-4 text-sm text-slate-500">Không có dịch vụ nào trong nhóm này.</p>
          )}
          {!loading &&
            rows.map((r) => {
              const on = chosen?.serviceId === r.serviceId;
              return (
                <button
                  key={r.serviceId}
                  type="button"
                  disabled={!r.available}
                  onClick={() => setPicked(r.serviceId)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 disabled:opacity-45 dark:border-white/5 ${
                    on
                      ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-500 dark:bg-brand-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <CarrierLogo id={r.partnerId} name={r.partnerName} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      {r.partnerName} - {r.serviceName}
                      {r.fastest && <Badge tone="success">Nhanh nhất</Badge>}
                      {r.cheapest && <Badge tone="warn">Rẻ nhất</Badge>}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {r.available
                        ? eta(r)
                          ? `Dự kiến ${eta(r)}`
                          : ' '
                        : (r.unavailableReason ?? 'Không khả dụng')}
                    </span>
                  </span>
                  <span className="font-mono text-sm font-semibold">{formatVnd(r.price)}</span>
                </button>
              );
            })}
        </div>
        {res && res.warnings.length > 0 && (
          <p className="mt-2 text-xs text-amber-600">{res.warnings.join(' · ')}</p>
        )}
        {chosen?.partnerId === 'ahamove' ? (
          <p className="mt-3 text-xs text-slate-500">
            AhaMove: tài xế được gọi ngay; đơn chuyển sang Đang giao (trừ tồn) khi tài xế đã lấy hàng. Tiền
            ship theo cách thanh toán đã cài cho AhaMove.
          </p>
        ) : (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={addFee}
              onChange={(e) => setAddFee(e.target.checked)}
            />
            <span>
              Cộng phí ship vào đơn
              <span className="block text-xs text-slate-500">
                Shop trả hãng, phí được cộng vào tổng đơn{order.codAmount > 0 ? ' và tiền thu hộ' : ''}. Bỏ
                chọn thì khách trả phí cho hãng.
              </span>
            </span>
          </label>
        )}
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          {chosen && (
            <span className="mr-auto text-sm text-slate-500">
              {chosen.partnerName}: <span className="font-mono font-semibold">{formatVnd(chosen.price)}</span>
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button disabled={!chosen || saving || loading} onClick={() => void submit()}>
            {saving ? 'Đang tạo…' : 'Xác nhận tạo'}
          </Button>
        </div>
      </div>
    </div>
  );
}
