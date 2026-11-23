'use client';

import {
  ImageIcon,
  ListOrdered,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  Store,
  Trash2,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Button } from '@/components/ui';
import { type CustomerSaved, useDetail } from '@/components/detail-drawer';
import { OrderDetail } from '@/components/order-detail';
import { PosShippingColumn, type ShipSelection } from '@/components/pos-shipping-column';
import { AreaSelect } from '@/components/vn-area-select';
import { formatRelativeDateTime } from '@/lib/datetime';
import { api } from '@/lib/api';
import { printReceipt, type ReceiptOrder, type ReceiptTemplate } from '@/lib/receipt';

interface Payload {
  lines: { variantId: string; qty: number; price: number }[];
  customer: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    addressLine?: string | null;
    region?: string | null;
    ward?: string | null;
  } | null;
  discount: number;
  otherIncome: number;
  paid: number;
  cod: boolean;
  receiver: { name: string; phone: string; address: string; area: string; ward: string };
  carrier: string;
  shippingFee: number;
  trackingNo: string;
  note: string;
  orderedAt: string | null;
  paymentMethod: 'cash' | 'transfer' | 'card' | 'wallet';
}
type Mode = 'retail' | 'delivery';
interface Draft {
  id: string;
  label: string;
  mode: Mode;
  payload: Payload;
}
interface VariantInfo {
  id: string;
  sku: string;
  barcode: string | null;
  price: number;
  productName: string;
  optionValues: unknown;
  image: string | null;
  onHand: number;
  /** Held by open delivery orders that have not shipped yet. */
  reserved: number;
  /** onHand minus reserved: what can still be sold. */
  available: number;
}
interface CustomerHit {
  id: string;
  name: string | null;
  phone: string | null;
}
interface CustomerFull {
  id: string;
  code: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  region: string | null;
  ward: string | null;
  kvDebt: number;
}
interface RecentOrder {
  code: string;
  status: string;
  total: number;
  orderedAt: string;
  customer: { name: string | null } | null;
}
const METHODS = [
  ['cash', 'Tiền mặt'],
  ['transfer', 'Chuyển khoản'],
  ['card', 'Thẻ'],
  ['wallet', 'Ví'],
] as const;
const STATUS_LABEL: Record<string, string> = {
  new: 'Mới',
  confirmed: 'Đã xác nhận',
  packing: 'Đang đóng gói',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  returned: 'Trả hàng',
};
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};
const fromLocal = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;
const quickAmounts = (total: number) =>
  [
    ...new Set([
      total,
      ceilTo(total, 10000),
      ceilTo(total, 10000) + 10000,
      ceilTo(total, 50000),
      ceilTo(total, 100000),
      ceilTo(total, 100000) + 100000,
    ]),
  ]
    .filter((n) => n >= total && n > 0)
    .sort((a, b) => a - b)
    .slice(0, 6);

function Thumb({ src, className = 'size-12' }: { src: string | null | undefined; className?: string }) {
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${className} shrink-0 rounded-md bg-slate-100 object-cover`}
    />
  ) : (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-md bg-slate-100 text-slate-400 dark:bg-slate-800`}
    >
      <ImageIcon className="size-5" />
    </span>
  );
}

const emptyPayload = (): Payload => ({
  lines: [],
  customer: null,
  discount: 0,
  otherIncome: 0,
  paid: 0,
  cod: true,
  receiver: { name: '', phone: '', address: '', area: '', ward: '' },
  carrier: '',
  shippingFee: 0,
  trackingNo: '',
  note: '',
  orderedAt: null,
  paymentMethod: 'cash',
});
const fmt = (n: number) => n.toLocaleString('vi-VN');
const optionText = (v: unknown) =>
  v && typeof v === 'object' ? Object.values(v as Record<string, unknown>).join(' / ') : '';
const num = (s: string) => Math.max(0, Number.parseInt(s.replace(/\D/g, ''), 10) || 0);
const line =
  'w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-brand-600 dark:border-slate-700';

function Money({
  value,
  onChange,
  className,
  autoFocus,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      inputMode="numeric"
      className={`${line} text-right tabular-nums ${className ?? ''}`}
      value={value ? fmt(value) : ''}
      placeholder="0"
      onChange={(e) => onChange(num(e.target.value))}
      onFocus={(e) => e.target.select()}
      autoFocus={autoFocus}
    />
  );
}

export default function PosPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, VariantInfo>>({});
  const { open: openDetail } = useDetail();
  const [cinfo, setCinfo] = useState<Record<string, CustomerFull>>({});
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<VariantInfo[]>([]);
  const [cq, setCq] = useState('');
  // the sales toolbar lives in the site header (the slot AppShell leaves open on this page)
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const wide = useWide();
  useEffect(() => setSlot(document.getElementById('app-header-slot')), []);
  const [hi, setHi] = useState(0);
  const [ci, setCi] = useState(0);
  const [chits, setChits] = useState<CustomerHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [paidInput, setPaidInput] = useState(0);
  const [done, setDone] = useState<{ code: string; order: ReceiptOrder } | null>(null);
  /** A customer id, or 'new' for the buyer being typed. */
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  // orders opened from the recent list live as extra tabs beside the drafts
  const [orderTabs, setOrderTabs] = useState<string[]>([]);
  const [orderTab, setOrderTab] = useState<string | null>(null);
  /** Order tab that should open its Tạo vận đơn price table once (a delivery order just made). */
  const [shipOnOpen, setShipOnOpen] = useState<string | null>(null);
  /** Whether a carrier gateway is set up (Allingo or Ahamove): only then the carrier column is offered. */
  const [carriersOn, setCarriersOn] = useState(false);
  const [shipMsg, setShipMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    api<{ configured: boolean; ahamove: boolean }>('/shipping/status')
      .then((s) => setCarriersOn(s.configured || s.ahamove))
      .catch(() => undefined);
  }, []);
  const draftsRef = useRef<Draft[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const searchRef = useRef<HTMLInputElement>(null);
  draftsRef.current = drafts;

  const learn = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const r = await api<{ data: VariantInfo[] }>('/pos/variants', { method: 'POST', json: { ids } });
    setInfo((cur) => ({ ...cur, ...Object.fromEntries(r.data.map((v) => [v.id, v])) }));
  }, []);
  const loadCustomer = useCallback(async (id: string) => {
    const r = await api<{ customer: CustomerFull }>(`/customers/${id}`);
    setCinfo((cur) => ({ ...cur, [id]: r.customer }));
    return r.customer;
  }, []);
  const loadRecent = useCallback(async () => {
    const r = await api<{ data: RecentOrder[] }>('/orders?source=pos&pageSize=40');
    setRecent(r.data);
  }, []);

  const newDraft = useCallback(async (mode: Mode = 'retail') => {
    const d = await api<Draft>('/pos/drafts', { method: 'POST', json: { mode, payload: emptyPayload() } });
    setDrafts((cur) => [...cur, d]);
    setActive(d.id);
    return d;
  }, []);

  useEffect(() => {
    (async () => {
      const r = await api<{ data: Draft[] }>('/pos/drafts');
      if (r.data.length) {
        setDrafts(r.data);
        setActive(r.data[0]!.id);
        await learn([...new Set(r.data.flatMap((d) => d.payload.lines.map((l) => l.variantId)))]);
        for (const id of new Set(r.data.map((d) => d.payload.customer?.id).filter((x): x is string => !!x)))
          void loadCustomer(id).catch(() => undefined);
      } else await newDraft();
      setLoaded(true);
    })().catch((e: Error) => setMsg(e.message));
  }, [learn, newDraft, loadCustomer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (recentOpen) void loadRecent().catch(() => undefined);
  }, [recentOpen, loadRecent]);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setConfirming(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const flush = useCallback(async (id: string) => {
    const d = draftsRef.current.find((x) => x.id === id);
    if (!d) return;
    await api(`/pos/drafts/${id}`, {
      method: 'PUT',
      json: { label: d.label, mode: d.mode, payload: d.payload },
    }).catch(() => undefined);
  }, []);
  const edit = (id: string, fn: (d: Draft) => Draft) => {
    setDrafts((cur) => cur.map((d) => (d.id === id ? fn(d) : d)));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => void flush(id), 700),
    );
  };

  const draft = drafts.find((d) => d.id === active) ?? null;
  const patch = (p: Partial<Payload>) =>
    draft && edit(draft.id, (d) => ({ ...d, payload: { ...d.payload, ...p } }));

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ data: VariantInfo[] }>(`/pos/search?q=${encodeURIComponent(q)}`)
        .then((r) => setHits(r.data))
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (cq.trim().length < 2) return setChits([]);
    const t = setTimeout(() => {
      api<{ data: CustomerHit[] }>(`/customers?q=${encodeURIComponent(cq)}&pageSize=8`)
        .then((r) => setChits(r.data))
        .catch(() => setChits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [cq]);

  useEffect(() => setHi(0), [hits]);
  useEffect(() => setCi(0), [chits, cq]);

  const addVariant = (v: VariantInfo) => {
    if (!draft) return;
    setInfo((cur) => ({ ...cur, [v.id]: v }));
    const has = draft.payload.lines.find((l) => l.variantId === v.id);
    patch({
      lines: has
        ? draft.payload.lines.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l))
        : [...draft.payload.lines, { variantId: v.id, qty: 1, price: v.price }],
    });
    setQ('');
    searchRef.current?.focus();
  };

  const receiverOf = (c: CustomerFull) => ({
    name: c.name ?? '',
    phone: c.phone ?? '',
    address: c.addressLine ?? '',
    area: c.region ?? '',
    ward: c.ward ?? '',
  });
  const pickCustomer = async (hit: CustomerHit) => {
    if (!draft) return;
    setCq('');
    setChits([]);
    const full = await loadCustomer(hit.id);
    // A delivery order takes the customer's address as the receiver; a counter sale only shows the card.
    patch({
      customer: { id: full.id, name: full.name, phone: full.phone },
      ...(draft.mode === 'delivery' ? { receiver: receiverOf(full) } : {}),
    });
  };
  /** Details saved in the customer drawer flow into the order: the buyer, and the receiver of a delivery. */
  const savedRef = useRef<(c: CustomerSaved) => void>(() => undefined);
  savedRef.current = (c) => {
    if (!draft) return;
    setCinfo((cur) => ({ ...cur, [c.id]: c }));
    patch({
      customer: { id: c.id, name: c.name, phone: c.phone },
      ...(draft.mode === 'delivery' ? { receiver: receiverOf(c) } : {}),
    });
  };
  const openNewCustomer = (who: NonNullable<Draft['payload']['customer']>) =>
    openDetail('customer', 'new', {
      initial: {
        name: who.name ?? null,
        phone: who.phone ?? null,
        email: who.email ?? null,
        addressLine: who.addressLine ?? null,
        region: who.region ?? null,
        ward: who.ward ?? null,
      },
      onSaved: (c) => savedRef.current(c),
    });
  /** A buyer typed on the screen: created together with the order when it is confirmed. */
  const newCustomer = (text: string) => {
    if (!draft) return;
    const isPhone = /^[\d\s.+-]{6,}$/.test(text);
    const who = { id: null, name: isPhone ? null : text, phone: isPhone ? text.replace(/\s/g, '') : null };
    setCq('');
    setChits([]);
    openNewCustomer(who);
    patch({
      customer: who,
      ...(draft.mode === 'delivery'
        ? {
            receiver: {
              ...draft.payload.receiver,
              name: who.name ?? draft.payload.receiver.name,
              phone: who.phone ?? draft.payload.receiver.phone,
            },
          }
        : {}),
    });
  };
  /** Dropping the customer also clears what that customer filled into the order (the receiver). */
  const removeCustomer = () =>
    patch({ customer: null, receiver: { name: '', phone: '', address: '', area: '', ward: '' } });
  const setMode = (m: Mode) => {
    if (!draft) return;
    const c = draft.payload.customer?.id ? cinfo[draft.payload.customer.id] : undefined;
    const r = draft.payload.receiver;
    const empty = !r.name && !r.phone && !r.address;
    edit(draft.id, (d) => ({
      ...d,
      mode: m,
      payload: m === 'delivery' && c && empty ? { ...d.payload, receiver: receiverOf(c) } : d.payload,
    }));
  };

  const p = draft?.payload;
  const subtotal = p ? p.lines.reduce((a, l) => a + l.price * l.qty, 0) : 0;
  const total = p ? Math.max(0, subtotal - p.discount + p.otherIncome) : 0;
  const retail = draft?.mode === 'retail';
  const outOfStock = p?.lines.filter((l) => (info[l.variantId]?.available ?? 0) < l.qty).length ?? 0;
  const when = toLocal(p?.orderedAt ?? null);
  const setWhen = (date: string, time: string) => date && time && patch({ orderedAt: fromLocal(date, time) });
  const customer = p?.customer?.id ? cinfo[p.customer.id] : undefined;
  const rcv = p?.receiver;
  /** A delivery sale with everything a carrier needs: the carrier column slides in. */
  const shipReady =
    carriersOn &&
    draft?.mode === 'delivery' &&
    !!p &&
    p.lines.length > 0 &&
    !!p.customer &&
    !!rcv &&
    !!(rcv.name.trim() && rcv.phone.trim() && rcv.address.trim() && rcv.area.trim() && rcv.ward.trim());

  const closeDraft = async (id: string) => {
    await api(`/pos/drafts/${id}`, { method: 'DELETE' }).catch(() => undefined);
    const rest = drafts.filter((d) => d.id !== id);
    setDrafts(rest);
    if (!rest.length) await newDraft();
    else if (active === id) setActive(rest[0]!.id);
  };

  const openConfirm = () => {
    if (!p) return;
    setMsg(null);
    setPaidInput(retail ? total : p.paid);
    setConfirming(true);
  };
  // the drawer's paid amount follows the total until the seller types one
  const paid = Math.min(paidInput, total);
  const cod = !retail && p?.cod ? total - paid : 0;

  const confirm = async (allowOversell = false) => {
    if (!draft || !p) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload: Payload = { ...p, paid, orderedAt: p.orderedAt ?? new Date().toISOString() };
      const r = await api<{ code: string }>(`/pos/drafts/${draft.id}/checkout`, {
        method: 'POST',
        json: { mode: draft.mode, payload, allowOversell },
      });
      const o = await api<{
        order: Omit<ReceiptOrder, 'customerName' | 'customerPhone'> & {
          customer: { name: string | null; phone: string | null } | null;
        };
      }>(`/orders/${r.code}`);
      if (draft.mode === 'delivery') {
        // stay on the sales page: open the new order right here and go on with its waybill
        setOrderTabs((t) => (t.includes(r.code) ? t : [...t, r.code]));
        setOrderTab(r.code);
        setShipOnOpen(r.code);
      }
      setDone(
        draft.mode === 'delivery'
          ? null
          : {
              code: r.code,
              order: {
                ...o.order,
                customerName: o.order.customer?.name ?? payload.receiver.name,
                customerPhone: o.order.customer?.phone ?? payload.receiver.phone,
              },
            },
      );
      setConfirming(false);
      const rest = drafts.filter((d) => d.id !== draft.id);
      setDrafts(rest);
      if (!rest.length) await newDraft();
      else setActive(rest[0]!.id);
      void loadRecent().catch(() => undefined);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /** Delivery sale with a carrier chosen in the third column: make the order, then book the carrier. */
  const placeWithShipping = async (sel: ShipSelection, allowOversell = false) => {
    if (!draft || !p) return;
    setBusy(true);
    setShipMsg(null);
    let code: string;
    try {
      const payload: Payload = {
        ...p,
        carrier: '',
        trackingNo: '',
        shippingFee: 0,
        paid: Math.min(p.paid, total),
        orderedAt: p.orderedAt ?? new Date().toISOString(),
      };
      const res = await api<{ code: string }>(`/pos/drafts/${draft.id}/checkout`, {
        method: 'POST',
        json: { mode: 'delivery', payload, allowOversell },
      });
      code = res.code;
    } catch (e) {
      setShipMsg((e as Error).message);
      setBusy(false);
      return;
    }
    const rest = drafts.filter((d) => d.id !== draft.id);
    setDrafts(rest);
    if (!rest.length) await newDraft();
    else setActive(rest[0]!.id);
    setOrderTabs((t) => (t.includes(code) ? t : [...t, code]));
    setOrderTab(code);
    try {
      await api(`/orders/${encodeURIComponent(code)}/shipments`, {
        method: 'POST',
        json: {
          serviceId: sel.serviceId,
          quotedPrice: sel.quotedPrice,
          boxKey: sel.boxKey,
          weightGrams: sel.weightGrams,
          lengthCm: sel.lengthCm,
          widthCm: sel.widthCm,
          heightCm: sel.heightCm,
          addFeeToOrder: sel.addFeeToOrder,
          ...(sel.scheduleAt ? { scheduleAt: sel.scheduleAt } : {}),
          ...(sel.ahamoveRequests?.length ? { ahamoveRequests: { requests: sel.ahamoveRequests } } : {}),
        },
      });
      setShipOnOpen(null);
      setNotice(null);
    } catch (e) {
      // the order is made; the waybill can be retried from its card
      setShipOnOpen(code);
      setNotice(`Đã tạo đơn ${code} nhưng chưa đặt được ${sel.partnerName}: ${(e as Error).message}`);
    }
    void loadRecent().catch(() => undefined);
    setBusy(false);
  };
  const print = async () => {
    if (!done) return;
    const t = await api<{ data: ReceiptTemplate[] }>('/receipt-templates');
    const tpl = t.data.find((x) => x.isDefault) ?? t.data[0];
    if (tpl) printReceipt(tpl, done.order);
  };

  if (!loaded || !draft || !p) return <p className="text-sm text-slate-500">{msg ?? 'Đang tải…'}</p>;

  const toolbar = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-nowrap">
      <div className="relative flex w-full min-w-0 items-center gap-2 lg:w-96 lg:flex-none">
        <button
          aria-label="Đơn gần đây"
          title="Đơn đã tạo gần đây"
          className="rounded-md bg-brand-700 p-2 text-white hover:bg-brand-600"
          onClick={() => setRecentOpen((o) => !o)}
        >
          <ListOrdered className="size-5" />
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300/80 bg-white/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          <Search className="size-4 text-slate-400" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, hits.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Escape') {
                setQ('');
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const exact = hits.find((h) => h.sku === q.trim() || h.barcode === q.trim());
                const pick = exact ?? hits[hi];
                if (pick) addVariant(pick);
              }
            }}
            placeholder="Tìm hàng (F3): mã, mã vạch, tên"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {q.trim().length > 0 && hits.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {hits.map((v, i) => (
              <li
                key={v.id}
                ref={(el) => {
                  if (el && i === hi) el.scrollIntoView({ block: 'nearest' });
                }}
              >
                <button
                  tabIndex={-1}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${i === hi ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => addVariant(v)}
                >
                  <Thumb src={v.image} className="size-12" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">
                      {v.productName} <span className="text-slate-500">{optionText(v.optionValues)}</span>
                    </span>
                    <span className="font-mono text-xs text-slate-500">{v.sku}</span>
                  </span>
                  <span className="text-right">
                    <span className="block tabular-nums">{fmt(v.price)}</span>
                    <span className={`text-xs ${v.available > 0 ? 'text-slate-500' : 'text-rose-600'}`}>
                      Còn bán {fmt(v.available)}
                      {v.reserved > 0 ? ` (tồn ${fmt(v.onHand)}, giữ ${fmt(v.reserved)})` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto lg:w-auto lg:flex-1">
        {drafts.map((d) => (
          <div
            key={d.id}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${d.id === active && !orderTab ? 'bg-brand-700 font-medium text-white' : 'bg-white/70 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}
          >
            <button
              onClick={() => {
                setActive(d.id);
                setOrderTab(null);
              }}
              className="flex items-center gap-1"
            >
              {d.mode === 'delivery' && <Truck className="size-3.5" />} {d.label}
            </button>
            <button aria-label="Đóng" tabIndex={-1} onClick={() => void closeDraft(d.id)}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {orderTabs.map((code) => (
          <div
            key={code}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${orderTab === code ? 'bg-brand-700 font-medium text-white' : 'bg-white/70 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}
          >
            <button onClick={() => setOrderTab(code)} className="flex items-center gap-1">
              <Receipt className="size-3.5" /> {code}
            </button>
            <button
              aria-label="Đóng"
              tabIndex={-1}
              onClick={() => {
                setOrderTabs((t) => t.filter((c) => c !== code));
                if (orderTab === code) setOrderTab(null);
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          className="shrink-0 rounded-md p-1.5 text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label="Thêm hóa đơn"
          onClick={() => {
            setOrderTab(null);
            void newDraft(draft.mode);
          }}
        >
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative -mx-4 -mb-[calc(6rem+env(safe-area-inset-bottom))] -mt-6 flex h-[calc(100dvh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col overflow-hidden lg:-mx-8 lg:-mb-10 lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top))]">
      {/* top bar: recent orders, product search, open drafts. In the site header on wide screens;
      on phones it sits at the top of the page so the search and its list get the full width. */}
      {wide && slot ? createPortal(toolbar, slot) : null}
      {!wide && (
        <div className="shrink-0 border-b border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/80">
          {toolbar}
        </div>
      )}

      {orderTab ? (
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
          {notice && (
            <p className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              {notice}
            </p>
          )}
          <OrderDetail key={orderTab} code={orderTab} embedded openShipping={shipOnOpen === orderTab} />
        </div>
      ) : (
        <>
          <div
            className={`grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-3 overflow-y-auto bg-slate-100 p-3 transition-[grid-template-columns] duration-300 ${shipReady ? 'lg:grid-cols-[minmax(240px,1fr)_minmax(320px,380px)_minmax(340px,400px)] lg:overflow-x-auto lg:pr-4' : 'lg:grid-cols-[1fr_minmax(360px,420px)] lg:overflow-visible'} lg:content-stretch dark:bg-slate-950`}
          >
            {/* lines: only the list scrolls */}
            <div className="flex flex-col rounded-lg bg-white lg:min-h-0 dark:bg-slate-900">
              <ul className="divide-y divide-slate-100 lg:min-h-0 lg:flex-1 lg:overflow-auto dark:divide-slate-800">
                {p.lines.length === 0 && (
                  <li className="p-6 text-center text-sm text-slate-500">
                    Chưa có sản phẩm. Tìm hàng hoặc quét mã vạch.
                  </li>
                )}
                {p.lines.map((l, i) => {
                  const v = info[l.variantId];
                  const low = v && v.available < l.qty;
                  return (
                    <li key={l.variantId} className="px-3 py-2">
                      <div
                        className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-sm ${shipReady ? '' : 'sm:flex-nowrap'}`}
                      >
                        <span className="w-5 text-slate-400">{i + 1}</span>
                        <Thumb src={v?.image} className="size-12" />
                        <span
                          className={`min-w-0 flex-1 ${shipReady ? 'basis-[calc(100%-6.5rem)]' : 'max-sm:basis-[calc(100%-6.5rem)]'}`}
                        >
                          <span className="line-clamp-2">
                            {v?.productName}{' '}
                            <span className="text-slate-500">{optionText(v?.optionValues)}</span>
                          </span>
                          <span className="font-mono text-xs text-slate-500">{v?.sku ?? '…'}</span>
                          {low && (
                            <span className="ml-2 text-xs text-rose-600">
                              Còn bán: {fmt(v.available)} (không đủ)
                              {v.reserved > 0 ? `, đang giữ ${fmt(v.reserved)}` : ''}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <button
                            aria-label="Giảm"
                            tabIndex={-1}
                            className="rounded-full border border-slate-300 p-1 dark:border-slate-700"
                            onClick={() =>
                              patch({
                                lines:
                                  l.qty <= 1
                                    ? p.lines.filter((x) => x.variantId !== l.variantId)
                                    : p.lines.map((x) =>
                                        x.variantId === l.variantId ? { ...x, qty: x.qty - 1 } : x,
                                      ),
                              })
                            }
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <input
                            inputMode="numeric"
                            className="w-12 border-b border-slate-300 bg-transparent text-center outline-none dark:border-slate-700"
                            value={l.qty}
                            onChange={(e) =>
                              patch({
                                lines: p.lines.map((x) =>
                                  x.variantId === l.variantId
                                    ? { ...x, qty: Math.max(1, num(e.target.value)) }
                                    : x,
                                ),
                              })
                            }
                          />
                          <button
                            aria-label="Tăng"
                            tabIndex={-1}
                            className="rounded-full border border-slate-300 p-1 dark:border-slate-700"
                            onClick={() =>
                              patch({
                                lines: p.lines.map((x) =>
                                  x.variantId === l.variantId ? { ...x, qty: x.qty + 1 } : x,
                                ),
                              })
                            }
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </span>
                        <span className={`w-24 ${shipReady ? '' : 'sm:w-28'}`}>
                          <Money
                            value={l.price}
                            onChange={(n) =>
                              patch({
                                lines: p.lines.map((x) =>
                                  x.variantId === l.variantId ? { ...x, price: n } : x,
                                ),
                              })
                            }
                          />
                        </span>
                        <span
                          className={`w-20 text-right font-medium tabular-nums max-sm:flex-1 ${shipReady ? 'flex-1' : 'sm:w-28'}`}
                        >
                          {fmt(l.price * l.qty)}
                        </span>
                        <button
                          aria-label="Xóa dòng"
                          tabIndex={-1}
                          onClick={() => patch({ lines: p.lines.filter((x) => x.variantId !== l.variantId) })}
                        >
                          <Trash2 className="size-4 text-slate-400 hover:text-rose-500" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div
                className={`grid shrink-0 gap-3 border-t border-slate-200 p-3 text-sm dark:border-slate-800 ${shipReady ? '' : 'sm:grid-cols-[1fr_auto]'}`}
              >
                <textarea
                  className="resize-none rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                  rows={3}
                  placeholder="Ghi chú đơn hàng"
                  value={p.note}
                  onChange={(e) => patch({ note: e.target.value })}
                />
                <div className={`w-full space-y-1 ${shipReady ? '' : 'sm:w-80 sm:min-w-64'}`}>
                  <div className="flex justify-between">
                    <span>Tổng tiền hàng ({p.lines.reduce((a, l) => a + l.qty, 0)})</span>
                    <span className="tabular-nums">{fmt(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span>Giảm giá</span>
                    <span className="w-32">
                      <Money value={p.discount} onChange={(n) => patch({ discount: n })} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span>Thu khác</span>
                    <span className="w-32">
                      <Money value={p.otherIncome} onChange={(n) => patch({ otherIncome: n })} />
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-semibold">
                    <span>Khách cần trả</span>
                    <span className="tabular-nums text-brand-700">{fmt(total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* right column: only this scrolls */}
            <div className="flex flex-col rounded-lg bg-white text-sm lg:min-h-0 dark:bg-slate-900">
              <div className="space-y-3 p-3 lg:min-h-0 lg:flex-1 lg:overflow-auto">
                <div className="flex items-center justify-end gap-2 text-slate-500">
                  <input
                    type="date"
                    className="border-b border-slate-300 bg-transparent text-sm outline-none dark:border-slate-700"
                    value={when.date}
                    max={toLocal(null).date}
                    onChange={(e) => setWhen(e.target.value, when.time)}
                  />
                  <input
                    type="time"
                    className="border-b border-slate-300 bg-transparent text-sm outline-none dark:border-slate-700"
                    value={when.time}
                    onChange={(e) => setWhen(when.date, e.target.value)}
                  />
                  {p.orderedAt && (
                    <button
                      className="text-xs text-brand-700"
                      tabIndex={-1}
                      onClick={() => patch({ orderedAt: null })}
                    >
                      Bây giờ
                    </button>
                  )}
                </div>

                <div className="relative">
                  <label className="flex items-center gap-2 border-b border-slate-300 pb-1.5 dark:border-slate-700">
                    <Search className="size-4 text-slate-400" />
                    <input
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      placeholder="Tìm khách hàng (tên, SĐT)"
                      value={cq}
                      onChange={(e) => setCq(e.target.value)}
                      onKeyDown={(e) => {
                        const n = chits.length + 1; // existing customers, then "create new"
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setCi((c) => Math.min(c + 1, n - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setCi((c) => Math.max(c - 1, 0));
                        } else if (e.key === 'Escape') {
                          setCq('');
                        } else if (e.key === 'Enter' && cq.trim().length >= 2) {
                          e.preventDefault();
                          if (ci < chits.length) void pickCustomer(chits[ci]!);
                          else newCustomer(cq.trim());
                        }
                      }}
                    />
                  </label>
                  {cq.trim().length >= 2 && (
                    <ul className="absolute left-0 right-0 z-10 mt-1 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {chits.map((c, i) => (
                        <li key={c.id}>
                          <button
                            tabIndex={-1}
                            className={`flex w-full justify-between px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${i === ci ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                            onMouseEnter={() => setCi(i)}
                            onClick={() => void pickCustomer(c)}
                          >
                            <span>{c.name ?? '(không tên)'}</span>
                            <span className="text-slate-500">{c.phone}</span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left font-medium text-brand-700 hover:bg-slate-100 dark:hover:bg-slate-800 ${ci === chits.length ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                          onMouseEnter={() => setCi(chits.length)}
                          onClick={() => newCustomer(cq.trim())}
                        >
                          + Tạo khách mới “{cq.trim()}”
                        </button>
                      </li>
                    </ul>
                  )}
                </div>

                {p.customer && !p.customer.id && (
                  <div
                    className="flex items-start gap-2 rounded-lg border border-dashed border-brand-600 p-2"
                    role="button"
                    tabIndex={0}
                    onClick={() => openNewCustomer(p.customer!)}
                    onKeyDown={(e) => e.key === 'Enter' && openNewCustomer(p.customer!)}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
                      <User className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {p.customer.name || p.customer.phone}
                      </span>
                      <span className="block text-xs text-slate-500">
                        Khách mới, bấm để nhập thêm thông tin; tạo khi xác nhận đơn
                        {!retail ? ' (nhập đủ thông tin người nhận bên dưới)' : ''}
                      </span>
                    </span>
                    <button
                      aria-label="Bỏ khách"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomer();
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                )}

                {p.customer?.id && (
                  <div className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <button
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      onClick={() =>
                        openDetail('customer', p.customer!.id!, { onSaved: (c) => savedRef.current(c) })
                      }
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
                        <User className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-brand-700">
                          {customer?.name ?? p.customer.name ?? '(không tên)'}{' '}
                          {customer?.code && (
                            <span className="text-xs font-normal text-slate-500">{customer.code}</span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {customer?.phone ?? p.customer.phone ?? 'Chưa có số điện thoại'}
                        </span>
                        {customer?.addressLine && (
                          <span className="block truncate text-xs text-slate-500">
                            {customer.addressLine}
                          </span>
                        )}
                      </span>
                    </button>
                    <button aria-label="Bỏ khách" tabIndex={-1} onClick={() => removeCustomer()}>
                      <X className="size-4" />
                    </button>
                  </div>
                )}

                {!retail && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-6">
                      <label className="text-xs text-slate-500">
                        Tên người nhận
                        <input
                          className={line}
                          placeholder="Nhập tên"
                          value={p.receiver.name}
                          onChange={(e) => patch({ receiver: { ...p.receiver, name: e.target.value } })}
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        Số điện thoại
                        <input
                          className={line}
                          placeholder="Nhập số điện thoại"
                          value={p.receiver.phone}
                          onChange={(e) => patch({ receiver: { ...p.receiver, phone: e.target.value } })}
                        />
                      </label>
                    </div>
                    <label className="block text-xs text-slate-500">
                      Địa chỉ chi tiết
                      <input
                        className={line}
                        placeholder="Số nhà, ngõ, đường"
                        value={p.receiver.address}
                        onChange={(e) => patch({ receiver: { ...p.receiver, address: e.target.value } })}
                      />
                    </label>
                    <AreaSelect
                      province={p.receiver.area}
                      ward={p.receiver.ward}
                      onChange={(v) => patch({ receiver: { ...p.receiver, area: v.province, ward: v.ward } })}
                    />
                    {!carriersOn && (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <label className="text-xs text-slate-500">
                          Đối tác giao hàng
                          <input
                            className={line}
                            value={p.carrier}
                            placeholder="SHOPEE, GHN, tự giao…"
                            onChange={(e) => patch({ carrier: e.target.value })}
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Phí trả ĐTGH
                          <Money value={p.shippingFee} onChange={(n) => patch({ shippingFee: n })} />
                        </label>
                        <label className="col-span-2 text-xs text-slate-500">
                          Mã vận đơn
                          <input
                            className={line}
                            placeholder="Nhập mã vận đơn"
                            value={p.trackingNo}
                            onChange={(e) => patch({ trackingNo: e.target.value })}
                          />
                        </label>
                      </div>
                    )}
                    <label className="flex items-center justify-between gap-4 pt-2">
                      <span>Thu hộ tiền (COD)</span>
                      <input
                        type="checkbox"
                        checked={p.cod}
                        onChange={(e) => patch({ cod: e.target.checked })}
                      />
                    </label>
                    {carriersOn && (
                      <label className="flex items-center justify-between gap-4 text-xs text-slate-500">
                        Khách đã thanh toán trước
                        <span className="w-32">
                          <Money value={p.paid} onChange={(n) => patch({ paid: n })} />
                        </span>
                      </label>
                    )}
                    {carriersOn && <div id="pos-parcel-slot" />}
                  </div>
                )}
                {outOfStock > 0 && (
                  <p className="text-xs text-amber-600">
                    {outOfStock} sản phẩm vượt số còn bán. Khi thanh toán sẽ báo thiếu, có thể chọn “Vẫn bán”
                    (tồn sẽ âm).
                  </p>
                )}
              </div>
              {!shipReady && (
                <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
                  <Button
                    className="h-12 w-full text-base"
                    disabled={busy || p.lines.length === 0}
                    onClick={openConfirm}
                  >
                    THANH TOÁN
                  </Button>
                </div>
              )}
            </div>
            {shipReady && p && (
              <PosShippingColumn
                input={{
                  receiver: p.receiver,
                  lines: p.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
                  codAmount: p.cod ? Math.max(0, total - Math.min(p.paid, total)) : 0,
                  total,
                }}
                busy={busy}
                message={
                  shipMsg && (
                    <>
                      <p className="text-rose-600">{shipMsg}</p>
                      {shipMsg.startsWith('Không đủ tồn') && (
                        <p className="text-xs text-slate-500">
                          Bấm “Thanh toán” ở cột bên cạnh để chọn “Vẫn bán” (tồn sẽ âm).
                        </p>
                      )}
                    </>
                  )
                }
                onConfirm={(sel) => void placeWithShipping(sel)}
                onPlaceWithoutCarrier={openConfirm}
              />
            )}
          </div>

          <div className="flex shrink-0 gap-1 border-t border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-900">
            {(
              [
                ['retail', 'Bán thường', Store],
                ['delivery', 'Bán giao hàng', Truck],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${draft.mode === m ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* recent orders slide out from the left; a click outside closes them */}
      {recentOpen && <div className="absolute inset-0 z-30" onClick={() => setRecentOpen(false)} />}
      <div
        className={`absolute inset-y-0 left-0 z-40 w-80 transform bg-white shadow-xl transition-transform duration-200 dark:bg-slate-900 ${recentOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3 dark:border-slate-800">
          <h2 className="font-medium">Đơn bán gần đây</h2>
          <button aria-label="Đóng" tabIndex={-1} onClick={() => setRecentOpen(false)}>
            <X className="size-4" />
          </button>
        </div>
        <ul className="h-[calc(100%-3rem)] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
          {recent.length === 0 && <li className="p-4 text-sm text-slate-500">Chưa có đơn bán tại quầy.</li>}
          {recent.map((o) => (
            <li key={o.code}>
              <button
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => {
                  setOrderTabs((t) => (t.includes(o.code) ? t : [...t, o.code]));
                  setOrderTab(o.code);
                  setRecentOpen(false);
                }}
              >
                <span className="flex items-center justify-between">
                  <span className="font-medium">{o.code}</span>
                  <span className="tabular-nums">{fmt(o.total)}</span>
                </span>
                <span className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {o.customer?.name ?? 'Khách lẻ'} · {formatRelativeDateTime(o.orderedAt)}
                  </span>
                  <Badge
                    tone={
                      o.status === 'cancelled' || o.status === 'returned'
                        ? 'danger'
                        : o.status === 'completed' || o.status === 'delivered'
                          ? 'success'
                          : 'brand'
                    }
                  >
                    {STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* confirm drawer */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => !busy && setConfirming(false)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{retail ? 'Bán thường' : 'Bán giao hàng'}</span>
              <span className="flex items-center gap-2">
                <input
                  type="date"
                  className="border-b border-slate-300 bg-transparent outline-none dark:border-slate-700"
                  value={when.date}
                  max={toLocal(null).date}
                  onChange={(e) => setWhen(e.target.value, when.time)}
                />
                <input
                  type="time"
                  className="border-b border-slate-300 bg-transparent outline-none dark:border-slate-700"
                  value={when.time}
                  onChange={(e) => setWhen(when.date, e.target.value)}
                />
                <button aria-label="Đóng" tabIndex={-1} onClick={() => setConfirming(false)}>
                  <X className="size-5" />
                </button>
              </span>
            </div>
            <h2 className="mt-3 border-t border-dashed border-slate-300 pt-3 text-lg font-semibold dark:border-slate-700">
              {customer?.name || p.customer?.name || (!retail ? p.receiver.name : '') || 'Khách lẻ'}
            </h2>
            <div className="mt-3 flex-1 space-y-3 overflow-auto text-sm">
              <div className="flex justify-between">
                <span>Tổng tiền hàng ({p.lines.reduce((a, l) => a + l.qty, 0)})</span>
                <span className="tabular-nums">{fmt(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Giảm giá</span>
                <span className="w-36">
                  <Money value={p.discount} onChange={(n) => patch({ discount: n })} />
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Thu khác</span>
                <span className="w-36">
                  <Money value={p.otherIncome} onChange={(n) => patch({ otherIncome: n })} />
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Khách cần trả</span>
                <span className="tabular-nums text-brand-700">{fmt(total)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>Khách thanh toán</span>
                <span className="w-36">
                  <Money value={paid} onChange={(n) => setPaidInput(n)} autoFocus />
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {METHODS.map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="method"
                      checked={p.paymentMethod === k}
                      onChange={() => patch({ paymentMethod: k })}
                    />{' '}
                    {label}
                  </label>
                ))}
              </div>
              {retail && (
                <div className="flex flex-wrap gap-2 rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
                  {quickAmounts(total).map((n) => (
                    <button
                      key={n}
                      tabIndex={-1}
                      className="rounded-full border border-slate-300 bg-white px-4 py-1.5 tabular-nums hover:border-brand-600 dark:border-slate-600 dark:bg-slate-900"
                      onClick={() => setPaidInput(n)}
                    >
                      {fmt(n)}
                    </button>
                  ))}
                </div>
              )}
              {retail && paidInput > total && (
                <p className="text-slate-500">Tiền thừa trả khách: {fmt(paidInput - total)}</p>
              )}
              {!retail && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <p>
                    Người nhận: {p.receiver.name || '—'} · {p.receiver.phone || '—'}
                  </p>
                  <p>
                    {[p.receiver.address, p.receiver.ward, p.receiver.area].filter(Boolean).join(', ') ||
                      'Chưa có địa chỉ'}
                  </p>
                  <p className="mt-1">
                    {p.cod ? `Thu hộ COD: ${fmt(cod)}` : 'Không thu hộ'}
                    {p.carrier ? ` · ${p.carrier}` : ''}
                  </p>
                  <p className="mt-1">
                    Hàng được giữ chỗ (không bán cho người khác), tồn kho chỉ trừ khi bấm “Giao cho ĐVVC”.
                  </p>
                </div>
              )}
              {msg && <p className="text-rose-600">{msg}</p>}
              {msg?.startsWith('Không đủ tồn') && (
                <Button variant="secondary" disabled={busy} onClick={() => void confirm(true)}>
                  Vẫn bán (tồn sẽ âm)
                </Button>
              )}
            </div>
            <Button
              className="mt-3 h-12 w-full text-base"
              disabled={busy}
              onClick={() => void confirm(false)}
            >
              {busy ? 'ĐANG TẠO ĐƠN…' : 'XÁC NHẬN'}
            </Button>
          </div>
        </div>
      )}

      {/* success popup */}
      {done && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl dark:bg-slate-900">
            <p className="text-lg font-semibold text-emerald-700">Tạo đơn hàng thành công</p>
            <p className="mt-1 text-sm text-slate-500">Mã đơn {done.code}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button onClick={() => void print()}>
                <Printer className="size-4" /> In biên lai
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setOrderTabs((t) => (t.includes(done.code) ? t : [...t, done.code]));
                  setOrderTab(done.code);
                  setDone(null);
                }}
              >
                Xem đơn
              </Button>
              <Button variant="ghost" onClick={() => setDone(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** True from the lg breakpoint up (where the sales toolbar fits in the site header). */
function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
