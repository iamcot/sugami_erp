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
import { Badge, Button } from '@/components/ui';
import { OrderDetail } from '@/components/order-detail';
import { formatRelativeDateTime } from '@/lib/datetime';
import { api } from '@/lib/api';
import { printReceipt, type ReceiptOrder, type ReceiptTemplate } from '@/lib/receipt';

interface Payload {
  lines: { variantId: string; qty: number; price: number }[];
  customer: { id?: string | null; name?: string | null; phone?: string | null } | null;
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
interface HistoryOrder {
  code: string;
  channel: { name: string };
  status: string;
  total: number;
  orderedAt: string;
  items: { sku: string; name: string; qty: number }[];
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

/** Popup with the customer's details; saving edits the customer record. */
function CustomerModal({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: (c: CustomerFull) => void;
}) {
  const [c, setC] = useState<CustomerFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stats, setStats] = useState<{ orders: number; spent: number } | null>(null);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [tab, setTab] = useState<'info' | 'history'>('info');
  useEffect(() => {
    api<{ customer: CustomerFull; stats: { orders: number; spent: number }; orders: HistoryOrder[] }>(
      `/customers/${id}`,
    )
      .then((r) => {
        setC(r.customer);
        setStats(r.stats);
        setHistory(r.orders);
      })
      .catch((e: Error) => setErr(e.message));
  }, [id]);
  const save = async () => {
    if (!c) return;
    try {
      await api(`/customers/${id}`, {
        method: 'PATCH',
        json: { name: c.name, phone: c.phone, email: c.email, addressLine: c.addressLine },
      });
      onSaved(c);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const set = (k: keyof CustomerFull, v: string) => setC((cur) => (cur ? { ...cur, [k]: v } : cur));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">
            {c?.name ?? 'Khách hàng'} <span className="text-sm font-normal text-slate-500">{c?.code}</span>
          </h2>
          <button aria-label="Đóng" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        {stats && c && (
          <p className="mt-2 text-sm text-slate-600">
            Nợ: <b>{fmt(c.kvDebt)}</b> | Số lần mua: <b>{fmt(stats.orders)}</b> | Tổng bán:{' '}
            <b>{fmt(stats.spent)}</b>
          </p>
        )}
        <div className="mt-3 flex gap-6 border-b border-slate-200 text-sm dark:border-slate-700">
          {(
            [
              ['info', 'Thông tin'],
              ['history', 'Lịch sử đặt hàng'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-1 pb-2 ${tab === k ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        {tab === 'history' && (
          <div className="mt-3 max-h-80 overflow-auto">
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Chưa có đơn hàng nào.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1.5 font-medium">Mã đơn</th>
                    <th className="py-1.5 font-medium">Thời gian</th>
                    <th className="py-1.5 font-medium">Sản phẩm</th>
                    <th className="py-1.5 text-right font-medium">Tổng tiền</th>
                    <th className="py-1.5 pl-3 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((o) => (
                    <tr key={o.code} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="py-1.5 font-medium">{o.code}</td>
                      <td className="whitespace-nowrap py-1.5">{formatRelativeDateTime(o.orderedAt)}</td>
                      <td className="py-1.5 text-xs text-slate-600">
                        {o.items
                          .slice(0, 3)
                          .map((it) => `${it.qty} × ${it.name}`)
                          .join('; ')}
                        {o.items.length > 3 ? ` … (+${o.items.length - 3})` : ''}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{fmt(o.total)}</td>
                      <td className="py-1.5 pl-3">{STATUS_LABEL[o.status] ?? o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {tab === 'info' && c && (
          <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              Mã khách hàng
              <input className={line} value={c.code ?? ''} disabled />
            </label>
            <label className="text-xs text-slate-500">
              Email
              <input className={line} value={c.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label className="text-xs text-slate-500">
              Tên khách hàng
              <input className={line} value={c.name ?? ''} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className="text-xs text-slate-500">
              Điện thoại
              <input className={line} value={c.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label className="text-xs text-slate-500 sm:col-span-2">
              Địa chỉ
              <input
                className={line}
                value={c.addressLine ?? ''}
                onChange={(e) => set('addressLine', e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Khu vực
              <input className={line} value={c.region ?? ''} disabled />
            </label>
            <label className="text-xs text-slate-500">
              Phường/Xã
              <input className={line} value={c.ward ?? ''} disabled />
            </label>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Bỏ qua
          </Button>
          <Button onClick={() => void save()}>Lưu</Button>
        </div>
      </div>
    </div>
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
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <input
      inputMode="numeric"
      className={`${line} text-right tabular-nums ${className ?? ''}`}
      value={value ? fmt(value) : ''}
      placeholder="0"
      onChange={(e) => onChange(num(e.target.value))}
      onFocus={(e) => e.target.select()}
    />
  );
}

export default function PosPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, VariantInfo>>({});
  const [cinfo, setCinfo] = useState<Record<string, CustomerFull>>({});
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<VariantInfo[]>([]);
  const [cq, setCq] = useState('');
  const [chits, setChits] = useState<CustomerHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [paidInput, setPaidInput] = useState(0);
  const [done, setDone] = useState<{ code: string; order: ReceiptOrder } | null>(null);
  const [customerOpen, setCustomerOpen] = useState<string | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  // orders opened from the recent list live as extra tabs beside the drafts
  const [orderTabs, setOrderTabs] = useState<string[]>([]);
  const [orderTab, setOrderTab] = useState<string | null>(null);
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
  const outOfStock = p?.lines.filter((l) => (info[l.variantId]?.onHand ?? 0) < l.qty).length ?? 0;
  const when = toLocal(p?.orderedAt ?? null);
  const setWhen = (date: string, time: string) => date && time && patch({ orderedAt: fromLocal(date, time) });
  const customer = p?.customer?.id ? cinfo[p.customer.id] : undefined;

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

  const confirm = async () => {
    if (!draft || !p) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload: Payload = { ...p, paid, orderedAt: p.orderedAt ?? new Date().toISOString() };
      const r = await api<{ code: string }>(`/pos/drafts/${draft.id}/checkout`, {
        method: 'POST',
        json: { mode: draft.mode, payload },
      });
      const o = await api<{
        order: Omit<ReceiptOrder, 'customerName' | 'customerPhone'> & {
          customer: { name: string | null; phone: string | null } | null;
        };
      }>(`/orders/${r.code}`);
      setDone({
        code: r.code,
        order: {
          ...o.order,
          customerName: o.order.customer?.name ?? payload.receiver.name,
          customerPhone: o.order.customer?.phone ?? payload.receiver.phone,
        },
      });
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
  const print = async () => {
    if (!done) return;
    const t = await api<{ data: ReceiptTemplate[] }>('/receipt-templates');
    const tpl = t.data.find((x) => x.isDefault) ?? t.data[0];
    if (tpl) printReceipt(tpl, done.order);
  };

  if (!loaded || !draft || !p) return <p className="text-sm text-slate-500">{msg ?? 'Đang tải…'}</p>;

  return (
    <div className="relative -mx-4 -mb-24 -mt-6 flex h-[calc(100dvh-7rem)] flex-col overflow-hidden lg:-mx-8 lg:-mb-10 lg:h-[calc(100dvh-3.5rem)]">
      {/* top bar: recent orders, product search, open drafts */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 bg-brand-600 px-3 py-2">
        <div className="relative flex w-full max-w-lg items-center gap-2">
          <button
            aria-label="Đơn gần đây"
            title="Đơn đã tạo gần đây"
            className="rounded-md bg-brand-700 p-2 text-white hover:bg-brand-800"
            onClick={() => setRecentOpen((o) => !o)}
          >
            <ListOrdered className="size-5" />
          </button>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white px-3 py-2 text-sm dark:bg-slate-900">
            <Search className="size-4 text-slate-400" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const exact = hits.find((h) => h.sku === q.trim() || h.barcode === q.trim());
                const pick = exact ?? (hits.length === 1 ? hits[0] : undefined);
                if (pick) addVariant(pick);
              }}
              placeholder="Tìm hàng (F3): mã, mã vạch, tên"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          {q.trim().length > 0 && hits.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {hits.map((v) => (
                <li key={v.id}>
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
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
                      <span className={`text-xs ${v.onHand > 0 ? 'text-slate-500' : 'text-rose-600'}`}>
                        Tồn {fmt(v.onHand)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {drafts.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-1 rounded-t-md px-3 py-1.5 text-sm ${d.id === active && !orderTab ? 'bg-white font-medium text-brand-700 dark:bg-slate-900' : 'bg-brand-700 text-white'}`}
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
              <button aria-label="Đóng" onClick={() => void closeDraft(d.id)}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {orderTabs.map((code) => (
            <div
              key={code}
              className={`flex items-center gap-1 rounded-t-md px-3 py-1.5 text-sm ${orderTab === code ? 'bg-white font-medium text-brand-700 dark:bg-slate-900' : 'bg-brand-700 text-white'}`}
            >
              <button onClick={() => setOrderTab(code)} className="flex items-center gap-1">
                <Receipt className="size-3.5" /> {code}
              </button>
              <button
                aria-label="Đóng"
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
            className="rounded-md p-1.5 text-white hover:bg-brand-700"
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

      {orderTab ? (
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
          <OrderDetail key={orderTab} code={orderTab} embedded />
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 gap-3 bg-slate-100 p-3 lg:grid-cols-[1fr_minmax(360px,420px)] dark:bg-slate-950">
            {/* lines: only the list scrolls */}
            <div className="flex min-h-0 flex-col rounded-lg bg-white dark:bg-slate-900">
              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                {p.lines.length === 0 && (
                  <li className="p-6 text-center text-sm text-slate-500">
                    Chưa có sản phẩm. Tìm hàng hoặc quét mã vạch.
                  </li>
                )}
                {p.lines.map((l, i) => {
                  const v = info[l.variantId];
                  const low = v && v.onHand < l.qty;
                  return (
                    <li key={l.variantId} className="px-3 py-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-slate-400">{i + 1}</span>
                        <Thumb src={v?.image} className="size-12" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2">
                            {v?.productName}{' '}
                            <span className="text-slate-500">{optionText(v?.optionValues)}</span>
                          </span>
                          <span className="font-mono text-xs text-slate-500">{v?.sku ?? '…'}</span>
                          {low && (
                            <span className="ml-2 text-xs text-rose-600">
                              Tồn: {fmt(v.onHand)} (không đủ)
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <button
                            aria-label="Giảm"
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
                        <span className="w-28">
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
                        <span className="w-28 text-right font-medium tabular-nums">
                          {fmt(l.price * l.qty)}
                        </span>
                        <button
                          aria-label="Xóa dòng"
                          onClick={() => patch({ lines: p.lines.filter((x) => x.variantId !== l.variantId) })}
                        >
                          <Trash2 className="size-4 text-slate-400 hover:text-rose-500" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="grid shrink-0 gap-3 border-t border-slate-200 p-3 text-sm sm:grid-cols-[1fr_auto] dark:border-slate-800">
                <textarea
                  className="resize-none rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                  rows={3}
                  placeholder="Ghi chú đơn hàng"
                  value={p.note}
                  onChange={(e) => patch({ note: e.target.value })}
                />
                <div className="w-full min-w-64 space-y-1 sm:w-80">
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
            <div className="flex min-h-0 flex-col rounded-lg bg-white text-sm dark:bg-slate-900">
              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
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
                    <button className="text-xs text-brand-700" onClick={() => patch({ orderedAt: null })}>
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
                    />
                  </label>
                  {chits.length > 0 && (
                    <ul className="absolute left-0 right-0 z-10 mt-1 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {chits.map((c) => (
                        <li key={c.id}>
                          <button
                            className="flex w-full justify-between px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => void pickCustomer(c)}
                          >
                            <span>{c.name ?? '(không tên)'}</span>
                            <span className="text-slate-500">{c.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {p.customer?.id && (
                  <div className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <button
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      onClick={() => setCustomerOpen(p.customer!.id!)}
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
                    <button aria-label="Bỏ khách" onClick={() => patch({ customer: null })}>
                      <X className="size-4" />
                    </button>
                  </div>
                )}

                {!retail && (
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className={line}
                        placeholder="Tên người nhận"
                        value={p.receiver.name}
                        onChange={(e) => patch({ receiver: { ...p.receiver, name: e.target.value } })}
                      />
                      <input
                        className={line}
                        placeholder="Số điện thoại"
                        value={p.receiver.phone}
                        onChange={(e) => patch({ receiver: { ...p.receiver, phone: e.target.value } })}
                      />
                    </div>
                    <input
                      className={line}
                      placeholder="Địa chỉ chi tiết (số nhà, ngõ, đường)"
                      value={p.receiver.address}
                      onChange={(e) => patch({ receiver: { ...p.receiver, address: e.target.value } })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className={line}
                        placeholder="Khu vực (tỉnh/quận)"
                        value={p.receiver.area}
                        onChange={(e) => patch({ receiver: { ...p.receiver, area: e.target.value } })}
                      />
                      <input
                        className={line}
                        placeholder="Phường/Xã"
                        value={p.receiver.ward}
                        onChange={(e) => patch({ receiver: { ...p.receiver, ward: e.target.value } })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
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
                          value={p.trackingNo}
                          onChange={(e) => patch({ trackingNo: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="flex items-center justify-between gap-4 pt-2">
                      <span>Thu hộ tiền (COD)</span>
                      <input
                        type="checkbox"
                        checked={p.cod}
                        onChange={(e) => patch({ cod: e.target.checked })}
                      />
                    </label>
                  </div>
                )}
                {outOfStock > 0 && (
                  <p className="text-xs text-amber-600">
                    {outOfStock} sản phẩm vượt tồn hiện có, vẫn cho bán (tồn sẽ âm).
                  </p>
                )}
              </div>
              <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
                <Button
                  className="h-12 w-full text-base"
                  disabled={busy || p.lines.length === 0}
                  onClick={openConfirm}
                >
                  THANH TOÁN
                </Button>
              </div>
            </div>
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
          <button aria-label="Đóng" onClick={() => setRecentOpen(false)}>
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
                <button aria-label="Đóng" onClick={() => setConfirming(false)}>
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
                  <Money value={paid} onChange={(n) => setPaidInput(n)} />
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
                </div>
              )}
              {msg && <p className="text-rose-600">{msg}</p>}
            </div>
            <Button className="mt-3 h-12 w-full text-base" disabled={busy} onClick={() => void confirm()}>
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

      {customerOpen && (
        <CustomerModal
          id={customerOpen}
          onClose={() => setCustomerOpen(null)}
          onSaved={(c) => {
            setCinfo((cur) => ({ ...cur, [c.id]: c }));
            // saved details flow into the order: the buyer, and the receiver of a delivery
            patch({
              customer: { id: c.id, name: c.name, phone: c.phone },
              ...(draft.mode === 'delivery' ? { receiver: receiverOf(c) } : {}),
            });
          }}
        />
      )}
    </div>
  );
}
