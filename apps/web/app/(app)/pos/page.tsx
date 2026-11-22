'use client';

import { Minus, Plus, Printer, Search, Trash2, Truck, Store, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
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
  addressLine?: string | null;
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
});
const fmt = (n: number) => n.toLocaleString('vi-VN');
const optionText = (v: unknown) =>
  v && typeof v === 'object' ? Object.values(v as Record<string, unknown>).join(' / ') : '';
const num = (s: string) => Math.max(0, Number.parseInt(s.replace(/\D/g, ''), 10) || 0);
const line =
  'w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-brand-600 dark:border-slate-700';

function Money({ value, onChange, className }: { value: number; onChange: (n: number) => void; className?: string }) {
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
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<VariantInfo[]>([]);
  const [cq, setCq] = useState('');
  const [chits, setChits] = useState<CustomerHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [printOn, setPrintOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const draftsRef = useRef<Draft[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const searchRef = useRef<HTMLInputElement>(null);
  draftsRef.current = drafts;

  const learn = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const r = await api<{ data: VariantInfo[] }>('/pos/variants', { method: 'POST', json: { ids } });
    setInfo((cur) => ({ ...cur, ...Object.fromEntries(r.data.map((v) => [v.id, v])) }));
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
      } else await newDraft();
      setLoaded(true);
    })().catch((e: Error) => setMsg({ ok: false, text: e.message }));
  }, [learn, newDraft]);

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

  const flush = useCallback(async (id: string) => {
    const d = draftsRef.current.find((x) => x.id === id);
    if (!d) return;
    await api(`/pos/drafts/${id}`, { method: 'PUT', json: { label: d.label, mode: d.mode, payload: d.payload } }).catch(
      () => undefined,
    );
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
  const patch = (p: Partial<Payload>) => draft && edit(draft.id, (d) => ({ ...d, payload: { ...d.payload, ...p } }));

  // product search
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

  const p = draft?.payload;
  const subtotal = p ? p.lines.reduce((a, l) => a + l.price * l.qty, 0) : 0;
  const total = p ? Math.max(0, subtotal - p.discount + p.otherIncome) : 0;
  const retail = draft?.mode === 'retail';
  const paidNow = !p ? 0 : retail && p.paid === 0 ? total : Math.min(p.paid, total);
  const cod = !retail && p?.cod ? total - paidNow : 0;
  const outOfStock = p?.lines.filter((l) => (info[l.variantId]?.onHand ?? 0) < l.qty).length ?? 0;

  const closeDraft = async (id: string) => {
    await api(`/pos/drafts/${id}`, { method: 'DELETE' }).catch(() => undefined);
    const rest = drafts.filter((d) => d.id !== id);
    setDrafts(rest);
    if (!rest.length) await newDraft();
    else if (active === id) setActive(rest[0]!.id);
  };

  const checkout = async () => {
    if (!draft || !p) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload: Payload = { ...p, paid: paidNow };
      const r = await api<{ code: string }>(`/pos/drafts/${draft.id}/checkout`, {
        method: 'POST',
        json: { mode: draft.mode, payload },
      });
      setMsg({ ok: true, text: `Đã tạo đơn ${r.code}` });
      if (printOn) {
        const [o, t] = await Promise.all([
          api<{
            order: Omit<ReceiptOrder, 'customerName' | 'customerPhone'> & {
              customer: { name: string | null; phone: string | null } | null;
            };
          }>(`/orders/${r.code}`),
          api<{ data: ReceiptTemplate[] }>('/receipt-templates'),
        ]);
        const tpl = t.data.find((x) => x.isDefault) ?? t.data[0];
        if (tpl)
          printReceipt(tpl, {
            ...o.order,
            customerName: o.order.customer?.name ?? payload.receiver.name,
            customerPhone: o.order.customer?.phone ?? payload.receiver.phone,
          });
      }
      const rest = drafts.filter((d) => d.id !== draft.id);
      setDrafts(rest);
      if (!rest.length) await newDraft();
      else setActive(rest[0]!.id);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded || !draft || !p) return <p className="text-sm text-slate-500">{msg?.text ?? 'Đang tải…'}</p>;

  return (
    <div className="-mx-4 -mt-6 flex min-h-[calc(100vh-3.5rem)] flex-col lg:-mx-8">
      {/* top bar: product search + open drafts */}
      <div className="flex flex-wrap items-center gap-2 bg-brand-600 px-3 py-2">
        <div className="relative w-full max-w-md">
          <label className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm dark:bg-slate-900">
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
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-96 overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {hits.map((v) => (
                <li key={v.id}>
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => addVariant(v)}
                  >
                    <span className="font-mono text-xs text-slate-500">{v.sku}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {v.productName} <span className="text-slate-500">{optionText(v.optionValues)}</span>
                    </span>
                    <span className={`text-xs ${v.onHand > 0 ? 'text-slate-500' : 'text-rose-600'}`}>Tồn {fmt(v.onHand)}</span>
                    <span className="tabular-nums">{fmt(v.price)}</span>
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
              className={`flex items-center gap-1 rounded-t-md px-3 py-1.5 text-sm ${d.id === active ? 'bg-white font-medium text-brand-700 dark:bg-slate-900' : 'bg-brand-700 text-white'}`}
            >
              <button onClick={() => setActive(d.id)} className="flex items-center gap-1">
                {d.mode === 'delivery' && <Truck className="size-3.5" />} {d.label}
              </button>
              <button aria-label="Đóng" onClick={() => void closeDraft(d.id)}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            className="rounded-md p-1.5 text-white hover:bg-brand-700"
            aria-label="Thêm hóa đơn"
            onClick={() => void newDraft(draft.mode)}
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>

      <div className="grid flex-1 gap-3 bg-slate-100 p-3 lg:grid-cols-[1fr_minmax(360px,420px)] dark:bg-slate-950">
        {/* lines */}
        <div className="flex min-h-[320px] flex-col rounded-lg bg-white dark:bg-slate-900">
          <ul className="flex-1 divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
            {p.lines.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Chưa có sản phẩm. Tìm hàng hoặc quét mã vạch.</li>}
            {p.lines.map((l, i) => {
              const v = info[l.variantId];
              const low = v && v.onHand < l.qty;
              return (
                <li key={l.variantId} className="px-3 py-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="w-6 text-slate-400">{i + 1}</span>
                    <span className="w-24 shrink-0 font-mono text-xs">{v?.sku ?? '…'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2">
                        {v?.productName} <span className="text-slate-500">{optionText(v?.optionValues)}</span>
                      </span>
                      {low && <span className="text-xs text-rose-600">Tồn: {fmt(v.onHand)} (không đủ)</span>}
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
                                : p.lines.map((x) => (x.variantId === l.variantId ? { ...x, qty: x.qty - 1 } : x)),
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
                          patch({ lines: p.lines.map((x) => (x.variantId === l.variantId ? { ...x, qty: Math.max(1, num(e.target.value)) } : x)) })
                        }
                      />
                      <button
                        aria-label="Tăng"
                        className="rounded-full border border-slate-300 p-1 dark:border-slate-700"
                        onClick={() => patch({ lines: p.lines.map((x) => (x.variantId === l.variantId ? { ...x, qty: x.qty + 1 } : x)) })}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </span>
                    <span className="w-28">
                      <Money
                        value={l.price}
                        onChange={(n) => patch({ lines: p.lines.map((x) => (x.variantId === l.variantId ? { ...x, price: n } : x)) })}
                      />
                    </span>
                    <span className="w-28 text-right font-medium tabular-nums">{fmt(l.price * l.qty)}</span>
                    <button aria-label="Xóa dòng" onClick={() => patch({ lines: p.lines.filter((x) => x.variantId !== l.variantId) })}>
                      <Trash2 className="size-4 text-slate-400 hover:text-rose-500" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="grid gap-1 border-t border-slate-200 p-3 text-sm sm:grid-cols-[1fr_auto] dark:border-slate-800">
            <textarea
              className="rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
              rows={3}
              placeholder="Ghi chú đơn hàng"
              value={p.note}
              onChange={(e) => patch({ note: e.target.value })}
            />
            <div className="w-full min-w-64 space-y-1 sm:w-80">
              <div className="flex justify-between"><span>Tổng tiền hàng ({p.lines.reduce((a, l) => a + l.qty, 0)})</span><span className="tabular-nums">{fmt(subtotal)}</span></div>
              <div className="flex items-center justify-between gap-6"><span>Giảm giá</span><span className="w-32"><Money value={p.discount} onChange={(n) => patch({ discount: n })} /></span></div>
              <div className="flex items-center justify-between gap-6"><span>Thu khác</span><span className="w-32"><Money value={p.otherIncome} onChange={(n) => patch({ otherIncome: n })} /></span></div>
              <div className="flex justify-between text-base font-semibold"><span>Khách cần trả</span><span className="tabular-nums text-brand-700">{fmt(total)}</span></div>
            </div>
          </div>
        </div>

        {/* customer, delivery, pay */}
        <div className="flex flex-col rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
          <div className="relative">
            <label className="flex items-center gap-2 border-b border-slate-300 pb-1.5 dark:border-slate-700">
              <Search className="size-4 text-slate-400" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder={p.customer?.id || p.customer?.name ? `${p.customer.name ?? ''} ${p.customer.phone ?? ''}` : 'Tìm khách hàng (tên, SĐT)'}
                value={cq}
                onChange={(e) => setCq(e.target.value)}
              />
              {(p.customer?.id || p.customer?.name) && (
                <button aria-label="Bỏ khách" onClick={() => patch({ customer: null })}>
                  <X className="size-4" />
                </button>
              )}
            </label>
            {chits.length > 0 && (
              <ul className="absolute left-0 right-0 z-10 mt-1 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {chits.map((c) => (
                  <li key={c.id}>
                    <button
                      className="flex w-full justify-between px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        patch({
                          customer: { id: c.id, name: c.name, phone: c.phone },
                          receiver: !retail
                            ? { ...p.receiver, name: c.name ?? '', phone: c.phone ?? '', address: c.addressLine ?? p.receiver.address }
                            : p.receiver,
                        });
                        setCq('');
                        setChits([]);
                      }}
                    >
                      <span>{c.name ?? '(không tên)'}</span>
                      <span className="text-slate-500">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!retail && (
            <div className="mt-3 space-y-1">
              <div className="grid grid-cols-2 gap-3">
                <input className={line} placeholder="Tên người nhận" value={p.receiver.name} onChange={(e) => patch({ receiver: { ...p.receiver, name: e.target.value } })} />
                <input className={line} placeholder="Số điện thoại" value={p.receiver.phone} onChange={(e) => patch({ receiver: { ...p.receiver, phone: e.target.value } })} />
              </div>
              <input className={line} placeholder="Địa chỉ chi tiết (số nhà, ngõ, đường)" value={p.receiver.address} onChange={(e) => patch({ receiver: { ...p.receiver, address: e.target.value } })} />
              <div className="grid grid-cols-2 gap-3">
                <input className={line} placeholder="Khu vực (tỉnh/quận)" value={p.receiver.area} onChange={(e) => patch({ receiver: { ...p.receiver, area: e.target.value } })} />
                <input className={line} placeholder="Phường/Xã" value={p.receiver.ward} onChange={(e) => patch({ receiver: { ...p.receiver, ward: e.target.value } })} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="text-xs text-slate-500">
                  Đối tác giao hàng
                  <input className={line} value={p.carrier} placeholder="SHOPEE, GHN, tự giao…" onChange={(e) => patch({ carrier: e.target.value })} />
                </label>
                <label className="text-xs text-slate-500">
                  Phí trả ĐTGH
                  <Money value={p.shippingFee} onChange={(n) => patch({ shippingFee: n })} />
                </label>
                <label className="col-span-2 text-xs text-slate-500">
                  Mã vận đơn
                  <input className={line} value={p.trackingNo} onChange={(e) => patch({ trackingNo: e.target.value })} />
                </label>
              </div>
            </div>
          )}

          <div className="mt-auto space-y-2 pt-4">
            <div className="flex items-center justify-between gap-4">
              <span>Khách thanh toán</span>
              <span className="w-36">
                <Money value={retail && p.paid === 0 ? total : p.paid} onChange={(n) => patch({ paid: n })} />
              </span>
            </div>
            {!retail && (
              <label className="flex items-center justify-between gap-4">
                <span>Thu hộ tiền (COD)</span>
                <span className="flex items-center gap-3">
                  <input type="checkbox" checked={p.cod} onChange={(e) => patch({ cod: e.target.checked })} />
                  <span className="text-lg font-semibold tabular-nums">{fmt(cod)}</span>
                </span>
              </label>
            )}
            {outOfStock > 0 && (
              <p className="text-xs text-amber-600">{outOfStock} sản phẩm vượt tồn hiện có, vẫn cho bán (tồn sẽ âm).</p>
            )}
            {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={printOn} onChange={(e) => setPrintOn(e.target.checked)} />
              <Printer className="size-3.5" /> In biên lai sau khi thanh toán
            </label>
            <Button className="h-12 w-full text-base" disabled={busy || p.lines.length === 0} onClick={() => void checkout()}>
              THANH TOÁN
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-t border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-900">
        {(
          [
            ['retail', 'Bán thường', Store],
            ['delivery', 'Bán giao hàng', Truck],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => edit(draft.id, (d) => ({ ...d, mode: m }))}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${draft.mode === m ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
