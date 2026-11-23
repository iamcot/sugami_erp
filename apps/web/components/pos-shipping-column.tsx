'use client';

import { formatVnd } from '@sugami/shared';
import { ArrowUpDown, Clock, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CarrierLogo } from '@/components/carrier-logo';
import { Badge, Button, Tabs } from '@/components/ui';
import { api } from '@/lib/api';

interface Quote {
  serviceId: string;
  serviceName: string;
  partnerId: string;
  partnerName: string;
  group: 'standard' | 'fast';
  price: number;
  etaText: string | null;
  etaMinutes: number | null;
  sortMinutes: number | null;
  speed: 'instant' | 'h4' | 'today' | 'other';
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
}
interface Settings {
  boxes: { key: string; label: string }[];
}

/** What the seller picked in the column; the page creates the order and the waybill from it. */
export interface ShipSelection {
  serviceId: string;
  quotedPrice: number;
  boxKey?: string;
  addFeeToOrder: boolean;
  scheduleAt?: string;
  partnerName: string;
}

export interface ShipInput {
  receiver: { name: string; phone: string; address: string; area: string; ward: string };
  lines: { variantId: string; qty: number }[];
  /** COD to collect before any fee the shop adds to the order. */
  codAmount: number;
  total: number;
}

const SPEED_TITLE: Record<Quote['speed'], string> = {
  instant: 'Giao ngay',
  h4: 'Giao trong 4 giờ',
  today: 'Giao trong ngày',
  other: 'Khác',
};
const SPEED_ORDER: Quote['speed'][] = ['instant', 'h4', 'today', 'other'];
const SCHEDULES = [
  ['now', 'Giao ngay'],
  ['30', 'Sau 30 phút'],
  ['60', 'Sau 1 giờ'],
  ['custom', 'Chọn giờ'],
] as const;
type Schedule = (typeof SCHEDULES)[number][0];

function eta(q: Quote): string | null {
  if (q.etaText) return q.etaText;
  if (q.etaMinutes == null) return null;
  return q.etaMinutes < 120 ? `${q.etaMinutes} phút` : `${Math.round(q.etaMinutes / 60)} giờ`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Third column of the counter screen for a delivery sale: carrier chosen from live prices (the shop's usual
 * normal carrier preselected), its settings, and the button that places the order and books the carrier.
 */
export function PosShippingColumn({
  input,
  busy,
  message,
  onConfirm,
  onPlaceWithoutCarrier,
}: {
  input: ShipInput;
  busy: boolean;
  message: React.ReactNode;
  onConfirm: (s: ShipSelection) => void;
  onPlaceWithoutCarrier: () => void;
}) {
  const [boxes, setBoxes] = useState<Settings['boxes']>([]);
  const [boxKey, setBoxKey] = useState<string | undefined>();
  const [addFee, setAddFee] = useState(false);
  const [res, setRes] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'standard' | 'fast'>('standard');
  const [sort, setSort] = useState<'price' | 'time'>('price');
  const [picked, setPicked] = useState<string | null>(null);
  /** The seller pressed X: show the whole list even though a carrier is chosen. */
  const [listOpen, setListOpen] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>('now');
  const [customAt, setCustomAt] = useState('');

  useEffect(() => {
    api<Settings>('/shipping/settings')
      .then((s) => setBoxes(s.boxes))
      .catch(() => undefined);
  }, []);

  // the same sale is priced once; any change in what the carrier needs to know prices it again
  const key = JSON.stringify([input, boxKey]);
  useEffect(() => {
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      api<QuoteResult>('/shipping/quotes', {
        method: 'POST',
        json: {
          receiver: input.receiver,
          lines: input.lines,
          codAmount: input.codAmount,
          total: input.total,
          boxKey,
          addFeeToOrder: false,
        },
      })
        .then((r) => {
          setRes(r);
          setBoxKey((k) => k ?? r.parcel.boxKey);
        })
        .catch((e: Error) => {
          setRes(null);
          setError(e.message);
        })
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(t);
  }, [key]);

  const all = useMemo(() => res?.data ?? [], [res]);
  // preselect the usual normal carrier (else the cheapest normal one); never override a choice the seller made
  const auto = useMemo(() => {
    const std = all.filter((r) => r.group === 'standard' && r.available);
    return (
      std.find((r) => r.partnerId === res?.preferredStandard) ??
      [...std].sort((a, b) => a.price - b.price)[0] ??
      null
    );
  }, [all, res?.preferredStandard]);
  const chosen =
    all.find((r) => r.serviceId === picked && r.available) ?? (listOpen ? null : picked ? null : auto);
  const showList = !chosen;

  const rows = all.filter((r) => r.group === tab);
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.available) - Number(a.available) ||
      (sort === 'time'
        ? (a.sortMinutes ?? 9999) - (b.sortMinutes ?? 9999) || a.price - b.price
        : a.price - b.price),
  );
  const grouped =
    tab === 'fast'
      ? SPEED_ORDER.map((s) => [s, sorted.filter((r) => r.speed === s)] as const).filter(([, l]) => l.length)
      : ([['other', sorted]] as const);

  const fastCard = chosen?.group === 'fast';
  const scheduleAt = (() => {
    if (!fastCard || schedule === 'now') return undefined;
    if (schedule === 'custom') return customAt ? new Date(customAt).toISOString() : undefined;
    return new Date(Date.now() + Number(schedule) * 60_000).toISOString();
  })();
  const scheduleBad =
    fastCard && schedule === 'custom' && (!customAt || new Date(customAt).getTime() < Date.now());
  const ahamove = chosen?.partnerId === 'ahamove';
  const fee = chosen?.price ?? 0;
  const addedFee = addFee && !ahamove ? fee : 0;

  const row = (r: Quote) => (
    <button
      key={r.serviceId}
      type="button"
      disabled={!r.available}
      onClick={() => {
        setPicked(r.serviceId);
        setListOpen(false);
      }}
      className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 disabled:opacity-45 dark:border-white/5 dark:hover:bg-white/5"
    >
      <CarrierLogo id={r.partnerId} name={r.partnerName} className="size-8" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {r.partnerName} - {r.serviceName}
          {r.fastest && <Badge tone="success">Nhanh nhất</Badge>}
          {r.cheapest && <Badge tone="warn">Rẻ nhất</Badge>}
        </span>
        <span className="block text-xs text-slate-500">
          {r.available ? (eta(r) ? `Dự kiến ${eta(r)}` : ' ') : (r.unavailableReason ?? 'Không khả dụng')}
        </span>
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums">{formatVnd(r.price)}</span>
    </button>
  );

  return (
    <div className="flex min-h-0 flex-col rounded-lg bg-white text-sm dark:bg-slate-900">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {loading && !res && <p className="text-slate-500">Đang lấy giá các hãng…</p>}
        {error && <p className="text-rose-600">{error}</p>}
        {res?.warnings.map((w) => (
          <p key={w} className="text-xs text-amber-600">
            {w}
          </p>
        ))}

        {chosen && (
          <div className="rounded-lg border border-brand-500/40">
            <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
              <CarrierLogo id={chosen.partnerId} name={chosen.partnerName} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {chosen.partnerName} - {chosen.serviceName}
                </span>
                <span className="block text-xs text-slate-500">
                  {eta(chosen)
                    ? `Dự kiến ${eta(chosen)}`
                    : chosen.group === 'fast'
                      ? 'Giao nhanh'
                      : 'Giao thường'}
                </span>
              </span>
              <span className="font-mono font-semibold tabular-nums">{formatVnd(chosen.price)}</span>
              <button
                type="button"
                aria-label="Đổi hãng vận chuyển"
                title="Đổi hãng vận chuyển"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
                onClick={() => {
                  setPicked(null);
                  setListOpen(true);
                  setTab(chosen.group);
                }}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <label>
                  Hộp{' '}
                  <select
                    className="rounded border border-slate-300 bg-transparent px-1.5 py-0.5 dark:border-slate-700"
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
                  <span>
                    {(res.parcel.grams / 1000).toLocaleString('vi-VN')} kg
                    {res.parcel.unknownWeights > 0 &&
                      ` (${res.parcel.unknownWeights} sản phẩm chưa có cân nặng, tạm tính theo mặc định)`}
                  </span>
                )}
              </div>

              <p className="flex items-center gap-2">
                <Wallet className="size-4 text-slate-400" />
                {input.codAmount > 0 ? (
                  <span>
                    Thu hộ COD: <b className="tabular-nums">{formatVnd(input.codAmount + addedFee)}</b>
                  </span>
                ) : (
                  <span>Không thu hộ (khách đã trả đủ)</span>
                )}
              </p>

              {!ahamove && (
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={addFee}
                    onChange={(e) => setAddFee(e.target.checked)}
                  />
                  <span>
                    Cộng phí ship vào đơn: shop trả hãng, khách trả lại qua tiền hàng
                    <span className="block text-slate-500">
                      {addFee ? 'Người trả phí: Shop' : 'Người trả phí: theo mặc định đã cài'}
                    </span>
                  </span>
                </label>
              )}

              {fastCard && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="size-4" /> Hẹn lấy hàng
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SCHEDULES.map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setSchedule(id);
                          if (id === 'custom' && !customAt)
                            setCustomAt(localInput(new Date(Date.now() + 2 * 3_600_000)));
                        }}
                        className={`rounded-full border px-3 py-1 text-xs ${schedule === id ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10' : 'border-slate-300 dark:border-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {schedule === 'custom' && (
                    <input
                      type="datetime-local"
                      className="w-full border-b border-slate-300 bg-transparent py-1 text-sm outline-none dark:border-slate-700"
                      value={customAt}
                      min={localInput(new Date())}
                      onChange={(e) => setCustomAt(e.target.value)}
                    />
                  )}
                  {schedule !== 'now' && (
                    <p className="text-xs text-slate-500">
                      Hẹn giờ thì hãng chỉ tìm tài xế gần giờ hẹn. Bấm “Tìm tài xế ngay” ở thẻ vận chuyển nếu
                      cần gọi sớm.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1 border-t border-slate-100 pt-2 text-xs dark:border-white/10">
                <div className="flex justify-between">
                  <span>Phí giao hàng</span>
                  <span className="tabular-nums">{formatVnd(fee)}</span>
                </div>
                {addedFee > 0 && (
                  <div className="flex justify-between">
                    <span>Khách cần trả (đã cộng phí ship)</span>
                    <span className="tabular-nums">{formatVnd(input.total + addedFee)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showList && all.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-2 border-b border-slate-100 p-1.5 dark:border-white/10">
              <Tabs
                className="flex-1"
                value={tab}
                onChange={setTab}
                items={[
                  {
                    id: 'standard',
                    label: 'Giao thường',
                    count: all.filter((r) => r.group === 'standard').length,
                  },
                  { id: 'fast', label: 'Giao nhanh', count: all.filter((r) => r.group === 'fast').length },
                ]}
              />
              <button
                type="button"
                title={
                  sort === 'price'
                    ? 'Đang xếp theo giá, bấm để xếp theo thời gian'
                    : 'Đang xếp theo thời gian, bấm để xếp theo giá'
                }
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                onClick={() => setSort((s) => (s === 'price' ? 'time' : 'price'))}
              >
                <ArrowUpDown className="size-4" /> {sort === 'price' ? 'Giá' : 'Thời gian'}
              </button>
            </div>
            {grouped.map(([speed, list]) => (
              <div key={speed}>
                {tab === 'fast' && (
                  <p className="bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
                    {SPEED_TITLE[speed]} ({list.length} dịch vụ)
                  </p>
                )}
                {list.map(row)}
              </div>
            ))}
            {sorted.length === 0 && <p className="p-3 text-slate-500">Không có hãng nào ở nhóm này.</p>}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
        {message}
        <Button
          className="h-12 w-full text-base"
          disabled={busy || !chosen || scheduleBad}
          onClick={() =>
            chosen &&
            onConfirm({
              serviceId: chosen.serviceId,
              quotedPrice: chosen.price,
              boxKey,
              addFeeToOrder: addFee && !ahamove,
              scheduleAt,
              partnerName: chosen.partnerName,
            })
          }
        >
          {busy ? 'ĐANG ĐẶT ĐƠN…' : 'XÁC NHẬN ĐẶT ĐƠN'}
        </Button>
        <button
          type="button"
          disabled={busy}
          className="w-full text-center text-xs text-slate-500 underline disabled:opacity-50"
          onClick={onPlaceWithoutCarrier}
        >
          Đặt đơn, tạo vận đơn sau
        </button>
      </div>
    </div>
  );
}
