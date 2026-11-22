'use client';

import { formatVnd } from '@sugami/shared';
import { Search } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/data-table';
import { useDetail } from '@/components/detail-drawer';
import { Badge, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useQueryState } from '@/lib/use-query-state';

interface OrderRow {
  id: string;
  code: string;
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
  shipProvince: string | null;
  note: string | null;
  updatedAt: string;
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
  ['returned', 'Hoàn hàng'],
  ['other', 'Khác'],
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

const fmtTime = (s: string) =>
  new Date(s).toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

const CHANNEL_ICON: Record<string, { letter: string; cls: string }> = {
  shopee: { letter: 'S', cls: 'bg-orange-500 text-white' },
  tiktok: { letter: 'T', cls: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' },
  store: { letter: 'Đ', cls: 'bg-brand-600 text-white' },
};

function ChannelIcon({ channel }: { channel: OrderRow['channel'] }) {
  const i = CHANNEL_ICON[channel.code] ?? {
    letter: channel.name.slice(0, 1),
    cls: 'bg-slate-400 text-white',
  };
  return (
    <span
      title={channel.name}
      className={`grid size-5 shrink-0 place-items-center rounded text-[11px] font-bold ${i.cls}`}
    >
      {i.letter}
    </span>
  );
}

/** Order code: internal code as a label (PC + number), the marketplace order number as the main text. Click copies it. */
function OrderCode({ o }: { o: OrderRow }) {
  const [copied, setCopied] = useState(false);
  const main = o.externalCode ?? o.code;
  const m = /^([A-Za-z_]+?)(\d+)$/.exec(o.code);
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
          className="font-mono text-xs font-medium hover:text-brand-600"
        >
          {copied ? 'Đã sao chép ✓' : main}
        </button>
        {o.externalCode && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            {m ? (
              <>
                <span className="rounded bg-slate-100 px-1 font-semibold dark:bg-slate-800">{m[1]}</span>
                {m[2]}
              </>
            ) : (
              o.code
            )}
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
    className: 'min-w-56',
    render: (o) => (
      <div className="max-w-sm">
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
    render: (o) => o.customer?.phone ?? dash,
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
    key: 'note',
    header: 'Ghi chú',
    className: 'min-w-32',
    render: (o) =>
      o.note ? <p className="line-clamp-2 max-w-xs text-slate-600 dark:text-slate-400">{o.note}</p> : dash,
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
    render: (o) => (
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
  }, [qs.q, qs.channel, qs.group, qs.range, qs.from, qs.to, qs.page]);

  return (
    <>
      <PageHeader
        title="Đơn hàng"
        description={
          res
            ? `${res.revenueOrders.toLocaleString('vi-VN')} đơn · doanh thu ${formatVnd(res.revenue)} (không tính đơn hủy)`
            : undefined
        }
      />
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {CHANNELS.map(([c, label]) => (
            <button
              key={c}
              onClick={() => setQs({ channel: c, page: '1' })}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${qs.channel === c ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
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
            placeholder="Mã đơn, mã Shopee, vận đơn, SKU, SĐT khách"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {RANGES.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setQs({ range: v, ...(v === 'custom' ? {} : { from: '', to: '' }), page: '1' })}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${qs.range === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {qs.range === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={qs.from}
              max={qs.to || undefined}
              onChange={(e) => setQs({ from: e.target.value, page: '1' })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-800 dark:bg-slate-900"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={qs.to}
              min={qs.from || undefined}
              onChange={(e) => setQs({ to: e.target.value, page: '1' })}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
        )}
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 md:ml-auto dark:bg-slate-800">
          {GROUPS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setQs({ group: v, page: '1' })}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${qs.group === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <DataTable
        columns={columns}
        rows={res?.data ?? []}
        rowKey={(o) => o.id}
        onRowClick={(o) => open('order', o.code)}
        isSelected={(o) => selected.order === o.code}
        page={Number(qs.page)}
        pageSize={50}
        total={res?.total}
        onPage={(p) => setQs({ page: String(p) })}
        loading={loading}
        empty="Chưa có đơn. Nhập file chi tiết hóa đơn từ KiotViet ở mục Nhập KiotViet."
      />
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
