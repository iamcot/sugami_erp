'use client';

import { formatVnd } from '@sugami/shared';
import { ArrowUpDown, Clock, RefreshCw, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CarrierLogo } from '@/components/carrier-logo';
import { Badge, Button } from '@/components/ui';
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
  packDeadline: string | null;
  info: string | null;
  details: string | null;
  breakdown: { name: string; value: number }[];
  extras: Extra[];
  tracking: string[];
}
interface Extra {
  id: string;
  name: string;
  description: string | null;
  kind: 'bool' | 'tier' | 'unit';
  price: number;
  maxInput: number | null;
  tiers: { code: string; name: string; description: string | null; price: number }[];
}
interface QuoteResult {
  data: Quote[];
  warnings: string[];
  parcel: { grams: number; boxKey: string; boxLabel: string; unknownWeights: number };
  preferredStandard: string;
}
interface Settings {
  boxes: { key: string; label: string; lengthCm: number; widthCm: number; heightCm: number }[];
}

/** What the seller picked in the column; the page creates the order and the waybill from it. */
export interface ShipSelection {
  serviceId: string;
  quotedPrice: number;
  boxKey?: string;
  /** Hand-typed size (box "Size khác"): grams and cm. */
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  addFeeToOrder: boolean;
  scheduleAt?: string;
  /** Ahamove extras switched on for the chosen service. */
  ahamoveRequests?: { id: string; tierCode?: string; num?: number }[];
  partnerName: string;
}

export interface ShipInput {
  receiver: { name: string; phone: string; address: string; area: string; ward: string };
  lines: { variantId: string; qty: number }[];
  /** COD to collect before any fee the shop adds to the order. */
  codAmount: number;
  total: number;
}

/** Largest parcel the API takes: 100 kg and 200 cm a side. */
const MAX_GRAMS = 100_000;
const MAX_CM = 200;

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

/** "15:30 hôm nay", "10:00 ngày mai" or "10:00 25/11". */
function whenText(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 86_400_000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 0) return `${hm} hôm nay`;
  if (diff === 1) return `${hm} ngày mai`;
  return `${hm} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  /** "Size khác": weight in grams and the three sides in cm, typed by the seller. */
  const [custom, setCustom] = useState<{ g: number; l: number; w: number; h: number } | null>(null);
  const [res, setRes] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'standard' | 'fast'>('standard');
  const [sort, setSort] = useState<'price' | 'time'>('price');
  const [picked, setPicked] = useState<string | null>(null);
  // Ahamove extras switched on: id → choice (tier code or count); belongs to the service in `extrasFor`
  const [extraPicks, setExtraPicks] = useState<Record<string, { tierCode?: string; num?: number }>>({});
  const [extrasFor, setExtrasFor] = useState<string | null>(null);
  /** The seller pressed X: show the whole list even though a carrier is chosen. */
  const [listOpen, setListOpen] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>('now');
  const [customAt, setCustomAt] = useState('');
  /** Bumped by the refresh button (and when the window regains focus after a failure) to price again. */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onFocus = () => error && setTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [error]);

  useEffect(() => {
    api<Settings>('/shipping/settings')
      .then((s) => setBoxes(s.boxes))
      .catch(() => undefined);
  }, []);

  // the same sale is priced once; any change in what the carrier needs to know prices it again
  const customOk = custom && custom.g > 0 && custom.l > 0 && custom.w > 0 && custom.h > 0 ? custom : null;
  const customBody = customOk
    ? { weightGrams: customOk.g, lengthCm: customOk.l, widthCm: customOk.w, heightCm: customOk.h }
    : {};
  const requests = Object.entries(extraPicks).map(([id, c]) => ({ id, ...c }));
  const ahamoveRequests = extrasFor && requests.length ? { serviceId: extrasFor, requests } : undefined;
  const key = JSON.stringify([input, boxKey, tick, customBody, ahamoveRequests]);
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
          ...customBody,
          ...(ahamoveRequests ? { ahamoveRequests } : {}),
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
  // the parcel (box / size) is edited in the left column, under the COD options
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('pos-parcel-slot')), []);
  useEffect(() => {
    // switching service drops the extras picked for the previous one
    const id = chosen?.serviceId ?? null;
    if (id !== extrasFor) {
      setExtraPicks({});
      setExtrasFor(id);
    }
  }, [chosen?.serviceId, extrasFor]);
  const setPick = (id: string, c: { tierCode?: string; num?: number } | null) =>
    setExtraPicks((p) => {
      const n = { ...p };
      if (c) n[id] = c;
      else delete n[id];
      return n;
    });

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
      className="flex w-full items-center gap-3 border-b border-slate-100 px-1 py-3.5 text-left last:border-0 hover:bg-slate-50 disabled:opacity-45 dark:border-white/5 dark:hover:bg-white/5"
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
          {r.available && r.packDeadline ? ` · Đóng hàng trước ${whenText(r.packDeadline)}` : ''}
        </span>
        {r.available && r.info && <span className="block text-xs text-slate-500">{r.info}</span>}
        {r.available && r.tracking.length > 0 && (
          <span className="block text-xs text-slate-500">Theo dõi: {r.tracking.join(', ')}</span>
        )}
      </span>
      <span className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {formatVnd(r.price)}
      </span>
    </button>
  );

  const parcelSection = (
    <section className="space-y-3 border-t border-slate-200 pt-3 dark:border-white/10">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Gói hàng</h3>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="text-slate-500">Hộp</span>
          <select
            className="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
            value={custom ? 'custom' : (boxKey ?? '')}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                const b = boxes.find((x) => x.key === boxKey);
                setCustom({
                  g: res?.parcel.grams ?? 500,
                  l: b?.lengthCm ?? 20,
                  w: b?.widthCm ?? 15,
                  h: b?.heightCm ?? 10,
                });
              } else {
                setCustom(null);
                setBoxKey(e.target.value);
              }
            }}
          >
            {boxes.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
            <option value="custom">Size khác…</option>
          </select>
        </label>
        {res && !custom && (
          <span className="text-slate-600 dark:text-slate-300">
            {(res.parcel.grams / 1000).toLocaleString('vi-VN')} kg
          </span>
        )}
      </div>
      {custom && (
        <div className="grid grid-cols-4 gap-3 text-xs text-slate-500">
          {(
            [
              ['g', 'Nặng (g)'],
              ['l', 'Dài (cm)'],
              ['w', 'Rộng (cm)'],
              ['h', 'Cao (cm)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block">
              {label}
              <input
                inputMode="numeric"
                className="mt-1 w-full border-0 border-b border-slate-300 bg-transparent py-1 text-sm text-slate-900 outline-none focus:border-brand-600 dark:border-slate-700 dark:text-slate-100"
                value={custom[k] || ''}
                onChange={(e) =>
                  setCustom({
                    ...custom,
                    [k]: Math.min(
                      k === 'g' ? MAX_GRAMS : MAX_CM,
                      Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0),
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      {custom && (
        <p className="text-xs text-slate-500">
          Cân nặng tính bằng gram (1 kg = 1000 g), tối đa 100.000 g; mỗi cạnh tối đa 200 cm.
        </p>
      )}
      {!custom && res && res.parcel.unknownWeights > 0 && (
        <p className="text-xs text-amber-600">
          {res.parcel.unknownWeights} sản phẩm chưa có cân nặng, tạm tính theo mặc định.
        </p>
      )}
    </section>
  );

  return (
    <>
      {slot && createPortal(parcelSection, slot)}
      <div className="flex min-h-0 flex-col rounded-lg bg-white text-sm dark:bg-slate-900">
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Hãng vận chuyển</span>
            <button
              type="button"
              title="Tải lại giá các hãng"
              aria-label="Tải lại giá các hãng"
              disabled={loading}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-white/10"
              onClick={() => setTick((t) => t + 1)}
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {loading && !res && <p className="text-slate-500">Đang lấy giá các hãng…</p>}
          {error && <p className="text-rose-600">{error}</p>}
          {res?.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-600">
              {w}
            </p>
          ))}

          {chosen && (
            <div className="rounded-lg border border-brand-500/40">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-white/10">
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
                <span className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatVnd(chosen.price)}
                </span>
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

              <div className="divide-y divide-slate-100 dark:divide-white/10">
                <section className="space-y-3 px-4 py-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Thanh toán</h3>
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
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={addFee}
                        onChange={(e) => setAddFee(e.target.checked)}
                      />
                      <span>
                        Cộng phí ship vào đơn
                        <span className="block text-xs text-slate-500">
                          {addFee
                            ? 'Shop trả hãng, khách trả lại qua tiền hàng'
                            : 'Người trả phí theo mặc định đã cài'}
                        </span>
                      </span>
                    </label>
                  )}
                </section>

                {fastCard && (
                  <section className="space-y-3 px-4 py-4">
                    <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <Clock className="size-4" /> Hẹn lấy hàng
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {SCHEDULES.map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setSchedule(id);
                            if (id === 'custom' && !customAt)
                              setCustomAt(localInput(new Date(Date.now() + 2 * 3_600_000)));
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs ${schedule === id ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10' : 'border-slate-300 dark:border-slate-700'}`}
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
                        Hẹn giờ thì hãng chỉ tìm tài xế gần giờ hẹn. Bấm “Tìm tài xế ngay” ở thẻ vận chuyển
                        nếu cần gọi sớm.
                      </p>
                    )}
                  </section>
                )}

                {chosen.extras.length > 0 && (
                  <section className="space-y-2 px-4 py-4">
                    <p className="text-slate-600 dark:text-slate-300">Dịch vụ mở rộng</p>
                    {chosen.extras.map((x) => {
                      const on = extraPicks[x.id];
                      const priceText =
                        x.kind === 'tier'
                          ? ''
                          : x.price > 0 && x.price < 1
                            ? `${Math.round(x.price * 100)}% phí quãng đường`
                            : x.price > 0
                              ? `+${formatVnd(x.price)}${x.kind === 'unit' ? ' / đơn vị' : ''}`
                              : 'miễn phí';
                      return (
                        <div key={x.id} className="space-y-1">
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={!!on}
                              onChange={(e) =>
                                setPick(
                                  x.id,
                                  e.target.checked
                                    ? x.kind === 'tier'
                                      ? { tierCode: x.tiers[0]?.code }
                                      : x.kind === 'unit'
                                        ? { num: 1 }
                                        : {}
                                    : null,
                                )
                              }
                            />
                            <span className="min-w-0 flex-1">
                              {x.name}
                              {priceText && <span className="ml-2 text-xs text-slate-500">{priceText}</span>}
                              {x.description && (
                                <span className="block text-xs text-slate-500">{x.description}</span>
                              )}
                            </span>
                          </label>
                          {on && x.kind === 'tier' && (
                            <select
                              className="ml-6 w-[calc(100%-1.5rem)] border-b border-slate-300 bg-transparent py-1 text-sm dark:border-slate-700"
                              value={on.tierCode}
                              onChange={(e) => setPick(x.id, { tierCode: e.target.value })}
                            >
                              {x.tiers.map((t) => (
                                <option key={t.code} value={t.code}>
                                  {t.name} (+{formatVnd(t.price)})
                                </option>
                              ))}
                            </select>
                          )}
                          {on && x.kind === 'unit' && (
                            <input
                              type="number"
                              min={1}
                              max={x.maxInput ?? 100}
                              className="ml-6 w-24 border-b border-slate-300 bg-transparent py-1 text-sm outline-none dark:border-slate-700"
                              value={on.num ?? 1}
                              onChange={(e) =>
                                setPick(x.id, {
                                  num: Math.min(
                                    x.maxInput ?? 100,
                                    Math.max(1, Math.floor(Number(e.target.value)) || 1),
                                  ),
                                })
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </section>
                )}
              </div>
            </div>
          )}

          {showList && all.length > 0 && (
            <div>
              <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/10">
                {(
                  [
                    ['standard', 'Giao thường'],
                    ['fast', 'Giao nhanh'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500'}`}
                  >
                    {label}{' '}
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {all.filter((r) => r.group === id).length}
                    </span>
                  </button>
                ))}
                <span className="flex-1" />
                <button
                  type="button"
                  title={
                    sort === 'price'
                      ? 'Đang xếp theo giá, bấm để xếp theo thời gian'
                      : 'Đang xếp theo thời gian, bấm để xếp theo giá'
                  }
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                  onClick={() => setSort((v) => (v === 'price' ? 'time' : 'price'))}
                >
                  <ArrowUpDown className="size-4" /> {sort === 'price' ? 'Giá' : 'Thời gian'}
                </button>
              </div>
              {grouped.map(([speed, list]) => (
                <div key={speed}>
                  {tab === 'fast' && (
                    <p className="mt-1 px-1 py-1.5 text-xs font-medium text-slate-500">
                      {SPEED_TITLE[speed]} ({list.length})
                    </p>
                  )}
                  {list.map(row)}
                </div>
              ))}
              {sorted.length === 0 && <p className="py-3 text-slate-500">Không có hãng nào ở nhóm này.</p>}
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
          {chosen && (
            <section className="max-h-56 space-y-2 overflow-auto rounded-lg border border-brand-500/40 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-300">Hạn đóng hàng</span>
                <span className="text-right font-medium">
                  {fastCard
                    ? scheduleAt
                      ? whenText(scheduleAt)
                      : 'Ngay bây giờ'
                    : chosen.packDeadline
                      ? whenText(chosen.packDeadline)
                      : 'Chưa đặt mốc lấy hàng'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-slate-600 dark:text-slate-300">Phí giao hàng</span>
                <span className="text-base font-semibold tabular-nums">{formatVnd(fee)}</span>
              </div>
              {chosen.breakdown.length > 1 &&
                chosen.breakdown.map((b) => (
                  <div key={b.name} className="flex justify-between pl-3 text-xs text-slate-500">
                    <span>{b.name}</span>
                    <span className="tabular-nums">{formatVnd(b.value)}</span>
                  </div>
                ))}
              {chosen.details && (
                <details className="pt-1 text-xs text-slate-500">
                  <summary className="cursor-pointer text-brand-700">
                    Điều khoản và biểu phí của dịch vụ
                  </summary>
                  <p className="mt-2 whitespace-pre-line">{chosen.details.trim()}</p>
                </details>
              )}
              {addedFee > 0 && (
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Khách cần trả (đã cộng phí ship)</span>
                  <span className="text-base font-semibold tabular-nums">
                    {formatVnd(input.total + addedFee)}
                  </span>
                </div>
              )}
            </section>
          )}
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
                ...customBody,
                addFeeToOrder: addFee && !ahamove,
                scheduleAt,
                ...(chosen.serviceId === extrasFor && requests.length ? { ahamoveRequests: requests } : {}),
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
    </>
  );
}
