'use client';

import { formatVnd } from '@sugami/shared';
import { ChevronDown, ChevronRight, ImageOff, Link2, Search, Unlink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDetail } from '@/components/detail-drawer';
import { LINKED_BY } from '@/components/listing-detail';
import { Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';

interface Listing {
  variationId: string;
  channel: string;
  shop: string;
  title: string;
  variationName: string | null;
  sku: string | null;
  price: number | null;
  quantity: number | null;
  linkedBy: string | null;
}
interface Row {
  id: string;
  sku: string;
  productCode: string;
  name: string;
  options: string[];
  imageUrl: string | null;
  onHand: number;
  listings: Listing[];
}
interface Unlinked {
  variationId: string;
  channel: string;
  shop: string;
  title: string;
  imageUrl: string | null;
  variationName: string | null;
  sku: string | null;
  price: number | null;
}

const PAGE = 30;
const FILTERS = [
  ['', 'Tất cả'],
  ['linked', 'Đã lên sàn'],
  ['none', 'Chưa lên sàn'],
] as const;

/** Sugami variants first; each shows the Shopee/TikTok listings linked to it, and can link more by hand. */
export function ListingsByProduct() {
  const { open } = useDetail();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [link, setLink] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<Row | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
    if (q) params.set('q', q);
    if (link) params.set('link', link);
    api<{ data: Row[]; total: number }>(`/listings/by-product?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setRows(r.data);
        setTotal(r.total);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [q, link, page, reload]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  const unlink = async (variationId: string) => {
    try {
      await api('/listings/link', { method: 'POST', json: { variationId, variantId: null } });
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {FILTERS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => {
                setLink(v);
                setPage(1);
              }}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${link === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm md:ml-auto md:max-w-xs dark:border-slate-800 dark:bg-slate-900">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên hoặc mã hàng Sugami"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-4 py-2 font-medium">Sản phẩm Sugami</th>
                <th className="px-4 py-2 text-right font-medium">Tồn</th>
                <th className="px-4 py-2 font-medium">Trên sàn</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => {
                const isOpen = expanded.has(r.id);
                const byChannel = new Map<string, number>();
                for (const l of r.listings) byChannel.set(l.channel, (byChannel.get(l.channel) ?? 0) + 1);
                return (
                  <FragmentRows key={r.id}>
                    <tr className="align-middle">
                      <td className="px-2 py-2">
                        {r.listings.length > 0 && (
                          <button onClick={() => toggle(r.id)} aria-label="Xem tin đăng">
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          {r.imageUrl ? (
                            <img
                              src={r.imageUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="size-10 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                            />
                          ) : (
                            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-300 dark:bg-slate-800">
                              <ImageOff className="size-4" />
                            </div>
                          )}
                          <button
                            onClick={() => open('product', r.productCode)}
                            className="min-w-0 text-left"
                          >
                            <span className="line-clamp-2 font-medium hover:underline">
                              {r.name}
                              {r.options.length > 0 && ` - ${r.options.join(' / ')}`}
                            </span>
                            <span className="font-mono text-xs text-slate-500">{r.sku}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.onHand.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {[...byChannel].map(([c, count]) => (
                            <Badge key={c} tone="success">
                              {c} · {count}
                            </Badge>
                          ))}
                          {r.listings.length === 0 && <Badge>Chưa lên sàn</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="secondary" onClick={() => setPicking(r)}>
                          <Link2 className="size-4" /> Nối tin đăng
                        </Button>
                      </td>
                    </tr>
                    {isOpen &&
                      r.listings.map((l) => (
                        <tr key={l.variationId} className="bg-slate-50/60 dark:bg-slate-900/40">
                          <td />
                          <td className="px-4 py-2 pl-16" colSpan={2}>
                            <p className="line-clamp-1 text-xs">
                              <Badge>{l.channel}</Badge> <span className="text-slate-500">{l.shop}</span>
                            </p>
                            <p className="line-clamp-1 text-sm">
                              {l.title}
                              {l.variationName && ` - ${l.variationName}`}
                            </p>
                            <p className="font-mono text-xs text-slate-500">
                              {l.sku ?? '–'}
                              {l.linkedBy && ` · ${LINKED_BY[l.linkedBy] ?? l.linkedBy}`}
                            </p>
                          </td>
                          <td className="px-4 py-2 text-xs tabular-nums text-slate-600">
                            {l.price === null ? '–' : formatVnd(l.price)} · tồn sàn {l.quantity ?? '–'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button variant="ghost" onClick={() => unlink(l.variationId)}>
                              <Unlink className="size-4" /> Bỏ nối
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </FragmentRows>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Không có sản phẩm nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-sm text-slate-500 dark:border-slate-800">
          <span>
            {loading ? 'Đang tải…' : `${total.toLocaleString('vi-VN')} mã hàng`} · trang {page}/{pages}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Trước
            </Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Sau
            </Button>
          </span>
        </div>
      </Card>
      {picking && (
        <Picker
          target={picking}
          onClose={() => setPicking(null)}
          onLinked={() => {
            setPicking(null);
            setExpanded((s) => new Set(s).add(picking.id));
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Pick a marketplace option that is not matched yet and link it to the chosen Sugami variant. */
function Picker({ target, onClose, onLinked }: { target: Row; onClose: () => void; onLinked: () => void }) {
  const [q, setQ] = useState(target.name.split(/\s+/).slice(0, 4).join(' '));
  const [items, setItems] = useState<Unlinked[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ data: Unlinked[] }>(`/listings/unlinked?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setItems(r.data))
        .catch((e: Error) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (variationId: string) => {
    setBusy(variationId);
    try {
      await api('/listings/link', { method: 'POST', json: { variationId, variantId: target.id } });
      onLinked();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Nối tin đăng sàn với</p>
            <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
              {target.name}
              {target.options.length > 0 && ` - ${target.options.join(' / ')}`}{' '}
              <span className="font-mono text-xs">({target.sku})</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-4 pb-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên tin đăng, biến thể hoặc SKU sàn"
            className="h-9 w-full rounded-lg border border-slate-200 bg-transparent px-3 text-sm outline-none dark:border-slate-700"
          />
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-4 pb-4 dark:divide-slate-800">
          {items.map((i) => (
            <li key={i.variationId} className="flex items-center gap-3 py-2">
              {i.imageUrl ? (
                <img
                  src={i.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                />
              ) : (
                <div className="size-10 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="line-clamp-2">
                  <Badge>{i.channel}</Badge> {i.title}
                  {i.variationName && ` - ${i.variationName}`}
                </p>
                <p className="font-mono text-xs text-slate-500">
                  {i.sku ?? '–'} · {i.shop}
                  {i.price !== null && ` · ${formatVnd(i.price)}`}
                </p>
              </div>
              <Button disabled={busy !== null} onClick={() => pick(i.variationId)}>
                Nối
              </Button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-500">
              Không có tin đăng chưa nối khớp từ khóa.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
