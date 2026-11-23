'use client';

import { formatVnd } from '@sugami/shared';
import { cn } from '@sugami/ui';
import { CheckCheck, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/data-table';
import { useDetail } from '@/components/detail-drawer';
import { FilterMenu } from '@/components/filter-menu';
import { PlatformDiamond } from '@/components/platform-icons';
import { Badge, Button, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeDateTime } from '@/lib/datetime';
import { useQueryState } from '@/lib/use-query-state';

interface OrderRow {
  id: string;
  code: string;
  source: string;
  externalCode: string | null;
  channel: { code: string; name: string };
  customer: {
    id: string;
    code: string | null;
    name: string | null;
    phone: string | null;
    addressLine: string | null;
  } | null;
  status: string;
  shippingStatus: string | null;
  carrier: string | null;
  trackingNo: string | null;
  shipByAt: string | null;
  shipAddress: string | null;
  shipPhone: string | null;
  shipProvince: string | null;
  note: string | null;
  updatedAt: string;
  returnHandledAt: string | null;
  total: number;
  orderedAt: string;
  items: { sku: string; name: string; qty: number }[];
}
interface ListResponse {
  data: OrderRow[];
  total: number;
  revenue: number;
  revenueOrders: number;
}

const CHANNELS = [
  ['', 'Tất cả kênh'],
  ['shopee', 'Shopee'],
  ['tiktok', 'TikTok Shop'],
  ['store', 'Bán trực tiếp'],
] as const;

const GROUPS = [
  ['', 'Tất cả'],
  ['waiting', 'Chờ đóng'],
  ['shipping', 'Đang giao'],
  ['done', 'Đã xong'],
  ['return_pending', 'Hoàn chờ xử lý'],
  ['returned', 'Hoàn hàng (tất cả)'],
  ['other', 'Đã hủy'],
] as const;

const RANGES = [
  ['', 'Tất cả'],
  ['today', 'Hôm nay'],
  ['week', 'Tuần này'],
  ['month', 'Tháng này'],
  ['custom', 'Tùy chọn'],
] as const;

const DAY = 86_400_000;
const VN = 7 * 3_600_000;
/** YYYY-MM-DD of an instant in Vietnam time. */
const vnDate = (t: number) => new Date(t + VN).toISOString().slice(0, 10);
const startOf = (day: string) => new Date(`${day}T00:00:00+07:00`);

/** [from, to) of the chosen range as ISO instants; empty strings = unbounded. */
function rangeBounds(range: string, from: string, to: string): { from: string; to: string } {
  const now = Date.now();
  const today = startOf(vnDate(now)).getTime();
  const end = new Date(today + DAY).toISOString();
  if (range === 'today') return { from: new Date(today).toISOString(), to: end };
  if (range === 'week') {
    const dow = (new Date(today + VN).getUTCDay() + 6) % 7; // Monday = 0
    return { from: new Date(today - dow * DAY).toISOString(), to: end };
  }
  if (range === 'month') return { from: startOf(`${vnDate(now).slice(0, 8)}01`).toISOString(), to: end };
  if (range === 'custom')
    return {
      from: from ? startOf(from).toISOString() : '',
      to: to ? new Date(startOf(to).getTime() + DAY).toISOString() : '',
    };
  return { from: '', to: '' };
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warn' | 'danger' }> = {
  new: { label: 'Mới', tone: 'brand' },
  confirmed: { label: 'Đã xác nhận', tone: 'brand' },
  packing: { label: 'Đang đóng gói', tone: 'warn' },
  shipped: { label: 'Đang giao', tone: 'warn' },
  delivered: { label: 'Đã giao', tone: 'success' },
  completed: { label: 'Hoàn thành', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'danger' },
  returned: { label: 'Trả hàng', tone: 'danger' },
};

const fmtTime = (s: string) => formatRelativeDateTime(s);

/** Orders the shop still has to act on: to pack, or a parcel back that nobody has checked. */
const needsAction = (o: OrderRow) =>
  ['new', 'confirmed', 'packing'].includes(o.status) || (o.status === 'returned' && !o.returnHandledAt);

const KNOWN_CHANNELS = ['shopee', 'tiktok', 'store'];

function ChannelIcon({ channel }: { channel: OrderRow['channel'] }) {
  if (KNOWN_CHANNELS.includes(channel.code))
    return (
      <span title={channel.name}>
        <PlatformDiamond platform={channel.code} className="size-5" />
      </span>
    );
  return (
    <span
      title={channel.name}
      className="grid size-5 shrink-0 place-items-center rounded bg-slate-400 text-[11px] font-bold text-white"
    >
      {channel.name.slice(0, 1)}
    </span>
  );
}

/** "HDSPE_261121TUHU8PVC" → label "HDSPE" + "261121TUHU8PVC"; "PC1418" → "PC" + "1418". */
const splitCode = (code: string) => {
  const m = /^([A-Za-z]{2,6})_?(\d.*)$/.exec(code);
  return m ? { prefix: m[1]!, rest: m[2]! } : { prefix: null, rest: code };
};

const Label = ({ children }: { children: string }) => (
  <span className="rounded bg-slate-100 px-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
    {children}
  </span>
);

/**
 * Order code: the marketplace order number is the main text; the system's own code (PC… from Pancake,
 * HDSPE_… invoice from KiotViet) sits below with its prefix as a label. Click copies the main code.
 */
function OrderCode({ o }: { o: OrderRow }) {
  const [copied, setCopied] = useState(false);
  const own = splitCode(o.code);
  const main = o.externalCode ?? own.rest;
  return (
    <div className="flex items-center gap-2">
      <ChannelIcon channel={o.channel} />
      <div className="min-w-0">
        <button
          title={copied ? 'Đã sao chép' : 'Bấm để sao chép mã đơn'}
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard?.writeText(main).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex items-center gap-1 font-mono text-xs font-medium hover:text-brand-600"
        >
          {!o.externalCode && own.prefix && <Label>{own.prefix}</Label>}
          {copied ? 'Đã sao chép ✓' : main}
        </button>
        {o.externalCode && (
          <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-500">
            {own.prefix && <Label>{own.prefix}</Label>}
            {own.rest}
          </p>
        )}
      </div>
    </div>
  );
}

function CustomerLink({ customer }: { customer: NonNullable<OrderRow['customer']> }) {
  const { open } = useDetail();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        open('customer', customer.code ?? customer.id);
      }}
      className="text-left text-brand-700 hover:underline dark:text-brand-50"
    >
      {customer.name ?? customer.code}
    </button>
  );
}

const dash = <span className="text-slate-400">–</span>;

const columns: Column<OrderRow>[] = [
  { key: 'code', header: 'Mã đơn', render: (o) => <OrderCode o={o} /> },
  {
    key: 'shipBy',
    header: 'Hạn bàn giao',
    className: 'whitespace-nowrap',
    render: (o) => {
      if (!o.shipByAt) return dash;
      const late = new Date(o.shipByAt) < new Date() && ['new', 'confirmed', 'packing'].includes(o.status);
      return <span className={late ? 'font-medium text-rose-600' : ''}>{fmtTime(o.shipByAt)}</span>;
    },
  },
  {
    key: 'carrier',
    header: 'ĐVVC',
    className: 'whitespace-nowrap',
    render: (o) =>
      o.carrier ? (
        <div>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium dark:bg-slate-800">
            {o.carrier}
          </span>
          {o.trackingNo && <p className="mt-0.5 font-mono text-xs text-slate-500">{o.trackingNo}</p>}
        </div>
      ) : (
        dash
      ),
  },
  {
    key: 'items',
    header: 'Sản phẩm',
    className: 'min-w-80',
    render: (o) => (
      <div className="max-w-md">
        {o.items.slice(0, 2).map((i, n) => (
          <p key={`${i.sku}-${n}`} className="line-clamp-1">
            <span className="tabular-nums text-slate-500">{i.qty}×</span> {i.name}
          </p>
        ))}
        {o.items.length > 2 && <p className="text-xs text-slate-500">+{o.items.length - 2} mặt hàng</p>}
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Khách hàng',
    className: 'whitespace-nowrap',
    render: (o) => (o.customer ? <CustomerLink customer={o.customer} /> : dash),
  },
  {
    key: 'phone',
    header: 'SĐT',
    className: 'whitespace-nowrap tabular-nums',
    render: (o) => o.shipPhone ?? o.customer?.phone ?? dash,
  },
  {
    key: 'address',
    header: 'Địa chỉ',
    className: 'min-w-48',
    render: (o) => {
      const a = o.shipAddress ?? o.shipProvince ?? o.customer?.addressLine;
      return a ? <p className="line-clamp-2 max-w-xs text-slate-600 dark:text-slate-400">{a}</p> : dash;
    },
  },
  {
    key: 'total',
    header: 'Tổng tiền',
    align: 'right',
    className: 'whitespace-nowrap tabular-nums',
    render: (o) => formatVnd(o.total),
  },
  {
    key: 'created',
    header: 'Thời gian tạo',
    className: 'whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400',
    render: (o) => fmtTime(o.orderedAt),
  },
  {
    key: 'updated',
    header: 'Cập nhật',
    className: 'whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400',
    render: (o) => fmtTime(o.updatedAt),
  },
  {
    key: 'status',
    header: 'Trạng thái',
    sticky: true,
    className: 'whitespace-nowrap',
    render: (o) =>
      o.status === 'returned' ? (
        o.returnHandledAt ? (
          <Badge tone="neutral">Hoàn · đã xử lý</Badge>
        ) : (
          <Badge tone="danger">Hoàn · chờ xử lý</Badge>
        )
      ) : (
        <Badge tone={STATUS[o.status]?.tone ?? 'neutral'}>{STATUS[o.status]?.label ?? o.status}</Badge>
      ),
  },
];

function OrdersList() {
  const { open, selected } = useDetail();
  const [qs, setQs] = useQueryState({
    q: '',
    channel: '',
    group: '',
    range: '',
    from: '',
    to: '',
    page: '1',
  });
  const [search, setSearch] = useState(qs.q);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // rows ticked for a bulk action; cleared whenever the list reloads
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPicked(new Set()), [res]);

  const completePicked = async () => {
    const codes = (res?.data ?? []).filter((o) => picked.has(o.id)).map((o) => o.code);
    if (!codes.length) return;
    if (
      !window.confirm(
        `Chuyển ${codes.length} đơn sang Hoàn tất? Đơn bán tại quầy chưa trừ tồn sẽ trừ tồn bây giờ và tính là đã thu đủ tiền. Đơn sàn sẽ được bỏ qua.`,
      )
    )
      return;
    setBusy(true);
    setBulkMsg(null);
    try {
      const r = await api<{ done: string[]; skipped: { code: string; reason: string }[] }>(
        '/orders/bulk/complete',
        { method: 'POST', json: { codes } },
      );
      setBulkMsg(
        `Đã hoàn tất ${r.done.length} đơn.` +
          (r.skipped.length
            ? ` Bỏ qua ${r.skipped.length}: ${r.skipped
                .slice(0, 5)
                .map((x) => `${x.code} (${x.reason})`)
                .join(', ')}${r.skipped.length > 5 ? '…' : ''}`
            : ''),
      );
      setReload((n) => n + 1);
    } catch (e) {
      setBulkMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api<{ waitingByChannel: Record<string, number> }>('/orders/counts').then(
      (r) => setCounts(r.waitingByChannel),
      () => {},
    );
  }, [reload]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qs.q) setQs({ q: search, page: '1' });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qs.q, setQs]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const { range, from, to, ...rest } = qs;
    const params = new URLSearchParams(
      Object.entries({ ...rest, ...rangeBounds(range, from, to), pageSize: '50' }).filter(
        ([, v]) => v !== '',
      ),
    );
    api<ListResponse>(`/orders?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setRes(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [qs.q, qs.channel, qs.group, qs.range, qs.from, qs.to, qs.page, reload]);

  const filtered = qs.q || qs.channel || qs.group || qs.range;
  const pages = res ? Math.max(1, Math.ceil(res.total / 50)) : 1;
  const page = Number(qs.page);
  return (
    <>
      <PageHeader title="Đơn hàng" />
      <div className="glass rounded-xl">
        {/* toolbar: refresh, summary, paging */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-300/50 px-3 py-2 dark:border-white/10">
          <button
            onClick={() => setReload((n) => n + 1)}
            className="rounded-md border border-slate-300/80 bg-white/70 p-1.5 text-slate-600 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-slate-300"
            title="Tải lại"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </button>
          {picked.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-brand-700 dark:text-brand-500">
                Đã chọn {picked.size}
              </span>
              <Button className="h-8 py-0" disabled={busy} onClick={() => void completePicked()}>
                <CheckCheck className="size-4" /> Hoàn tất đơn
              </Button>
              <Button variant="ghost" className="h-8 py-0" onClick={() => setPicked(new Set())}>
                Bỏ chọn
              </Button>
            </div>
          )}
          {res && picked.size === 0 && (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              <b className="font-mono font-semibold text-slate-900 dark:text-white">
                {res.revenueOrders.toLocaleString('vi-VN')}
              </b>{' '}
              đơn · doanh thu{' '}
              <b className="font-mono font-semibold text-slate-900 dark:text-white">
                {formatVnd(res.revenue)}
              </b>
              <span className="hidden sm:inline"> (không tính đơn hủy)</span>
            </span>
          )}
          {res && (
            <div className="ml-auto flex items-center gap-2 font-mono text-xs text-slate-500">
              {res.total === 0 ? 0 : (page - 1) * 50 + 1}–{Math.min(page * 50, res.total)} /{' '}
              {res.total.toLocaleString('vi-VN')}
              <div className="flex">
                <button
                  disabled={page <= 1}
                  onClick={() => setQs({ page: String(page - 1) })}
                  className="rounded-l-md border border-slate-300/80 bg-white/70 p-1 hover:bg-white disabled:opacity-40 dark:border-white/15 dark:bg-white/5"
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  disabled={page >= pages}
                  onClick={() => setQs({ page: String(page + 1) })}
                  className="-ml-px rounded-r-md border border-slate-300/80 bg-white/70 p-1 hover:bg-white disabled:opacity-40 dark:border-white/15 dark:bg-white/5"
                  aria-label="Trang sau"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>
        {/* filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-300/50 bg-white/30 px-3 py-2 dark:border-white/10 dark:bg-black/10">
          <span className="hud-label text-slate-500">Lọc</span>
          <FilterMenu
            label="Trạng thái"
            value={qs.group}
            options={GROUPS}
            onChange={(v) => setQs({ group: v, page: '1' })}
          />
          <FilterMenu
            label="Thời gian"
            value={qs.range}
            options={RANGES}
            onChange={(v) => setQs({ range: v, ...(v === 'custom' ? {} : { from: '', to: '' }), page: '1' })}
            footer={
              qs.range === 'custom' ? (
                <div className="flex items-center gap-1 text-sm">
                  <input
                    type="date"
                    value={qs.from}
                    max={qs.to || undefined}
                    onChange={(e) => setQs({ from: e.target.value, page: '1' })}
                    className="h-8 rounded-md border border-slate-300 bg-white px-1.5 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="date"
                    value={qs.to}
                    min={qs.from || undefined}
                    onChange={(e) => setQs({ to: e.target.value, page: '1' })}
                    className="h-8 rounded-md border border-slate-300 bg-white px-1.5 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              ) : undefined
            }
          />
          {filtered && (
            <button
              onClick={() => {
                setSearch('');
                setQs({ q: '', channel: '', group: '', range: '', from: '', to: '', page: '1' });
              }}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-500"
            >
              Xóa bộ lọc
            </button>
          )}
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300/80 bg-white/80 px-2.5 text-sm md:ml-auto md:max-w-xs md:flex-none md:basis-80 dark:border-white/15 dark:bg-white/5">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mã đơn, mã Shopee, vận đơn, SKU, SĐT"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
        {/* channel tabs */}
        <div className="flex overflow-x-auto border-b border-slate-300/50 dark:border-white/10">
          {CHANNELS.map(([c, label]) => (
            <button
              key={c}
              onClick={() => setQs({ channel: c, page: '1' })}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium sm:min-w-40',
                qs.channel === c
                  ? 'border-brand-600 bg-gradient-to-t from-brand-500/10 to-transparent text-brand-700 dark:text-brand-500'
                  : 'border-transparent text-slate-600 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-white/5',
              )}
            >
              {c ? <PlatformDiamond platform={c} className="size-[18px]" /> : null}
              {label}
              {c && counts?.[c] ? (
                <span className="rounded-sm bg-brand-600 px-1 font-mono text-[11px] font-semibold text-white">
                  {counts[c]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {error && <p className="px-4 py-2 text-sm text-rose-600">{error}</p>}
        {bulkMsg && (
          <p className="border-b border-slate-300/50 bg-brand-50/60 px-4 py-2 text-sm dark:border-white/10 dark:bg-brand-500/10">
            {bulkMsg}
          </p>
        )}
        <DataTable
          bare
          columns={columns}
          rows={res?.data ?? []}
          rowKey={(o) => o.id}
          onRowClick={(o) => open('order', o.code)}
          isSelected={(o) => selected.order === o.code}
          rowEmphasis={needsAction}
          selection={{ selected: picked, onChange: setPicked }}
          page={Number(qs.page)}
          pageSize={50}
          total={res?.total}
          onPage={(p) => setQs({ page: String(p) })}
          loading={loading}
          empty="Chưa có đơn. Nhập file chi tiết hóa đơn từ KiotViet ở mục Nhập KiotViet."
        />
        <p className="border-t border-slate-300/50 px-4 py-2 text-xs text-slate-500 dark:border-white/10">
          Đơn in đậm có vạch màu bên trái là đơn cần xử lý: chờ đóng gói hoặc hàng hoàn chưa kiểm.
        </p>
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}
