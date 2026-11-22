'use client';

import { formatVnd } from '@sugami/shared';
import { useEffect, useState } from 'react';
import { useDetail } from '@/components/detail-drawer';
import { Badge, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface Line {
  id: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  price: number;
  lineTotal: number;
  costSnapshot: number | null;
  variantId: string | null;
}
interface Order {
  id: string;
  code: string;
  externalCode: string | null;
  kiotvietInvoiceCode: string | null;
  source: string;
  status: string;
  shippingStatus: string | null;
  carrier: string | null;
  trackingNo: string | null;
  shipByAt: string | null;
  shipAddress: string | null;
  shipProvince: string | null;
  platformFee: number;
  feeDetail: Record<string, number> | null;
  subtotal: number;
  discount: number;
  otherIncome: number;
  total: number;
  paidAmount: number;
  codAmount: number;
  shippingFee: number;
  orderedAt: string;
  completedAt: string | null;
  stockAppliedAt: string | null;
  internalNote: string | null;
  channel: { code: string; name: string };
  customer: { id: string; kiotvietCode: string | null; name: string | null; phone: string | null } | null;
  lines: Line[];
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
const SOURCE: Record<string, string> = {
  pancake: 'Pancake',
  kiotviet_excel: 'File KiotViet',
  manual: 'Nhập tay',
};

const FEE_LABEL: Record<string, string> = {
  commission_fee: 'Phí hoa hồng',
  service_fee: 'Phí dịch vụ',
  transaction_fee: 'Phí giao dịch',
  seller_voucher: 'Voucher shop',
  shipping_fee_discount: 'Giảm phí vận chuyển',
};

const dt = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    : '–';

function Row({ label, value, strong }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {children}
    </Card>
  );
}

export function OrderDetail({ code, embedded }: { code: string; embedded?: boolean }) {
  const { open } = useDetail();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ order: Order }>(`/orders/${encodeURIComponent(decodeURIComponent(code))}`)
      .then((r) => setOrder(r.order))
      .catch((e: Error) => setError(e.message));
  }, [code]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!order) return <p className="text-sm text-slate-500">Đang tải…</p>;

  const st = STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
  const cost = order.lines.reduce((a, l) => a + (l.costSnapshot ?? 0) * l.qty, 0);
  const knownCost = order.lines.every((l) => l.costSnapshot !== null && l.variantId !== null);
  const afterDiscount = order.subtotal - order.discount;
  const isMarketplace = ['shopee', 'tiktok'].includes(order.channel.code);
  const toCollect = order.codAmount || Math.max(0, order.total - order.paidAmount);

  return (
    <>
      <PageHeader
        title={order.code}
        description={[order.channel.name, dt(order.orderedAt), SOURCE[order.source] ?? order.source]
          .filter(Boolean)
          .join(' · ')}
        actions={<Badge tone={st.tone}>{st.label}</Badge>}
      />

      <div className={embedded ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-3'}>
        <div className={embedded ? 'space-y-4' : 'space-y-4 lg:col-span-2'}>
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-800">
              Sản phẩm ({order.lines.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                  <tr>
                    <th className="px-4 py-2 font-medium">Sản phẩm</th>
                    <th className="px-4 py-2 text-right font-medium">SL</th>
                    <th className="px-4 py-2 text-right font-medium">Đơn giá</th>
                    <th className="px-4 py-2 text-right font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <p className="line-clamp-2">{l.name}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {l.variantId ? (
                            l.sku
                          ) : (
                            <span className="text-amber-600">
                              {l.sku || '(không có mã)'} · chưa có trong Sugami
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{l.qty}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                        {l.discount > 0 && (
                          <span className="mr-1 text-xs text-slate-400 line-through">
                            {formatVnd(l.unitPrice)}
                          </span>
                        )}
                        {formatVnd(l.price)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                        {formatVnd(l.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Giá trị đơn hàng">
              <Row label="Tổng tiền hàng" value={formatVnd(order.subtotal)} />
              <Row
                label="Giảm giá"
                value={order.discount ? `- ${formatVnd(order.discount)}` : formatVnd(0)}
              />
              <Row label="Sau giảm giá" value={formatVnd(afterDiscount)} />
              <Row label="Phí vận chuyển" value={formatVnd(order.shippingFee)} />
              <Row label="Thu khác" value={formatVnd(order.otherIncome)} />
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              <Row label="Khách cần trả" value={formatVnd(order.total)} strong />
              {knownCost && order.lines.length > 0 && (
                <Row
                  label="Lãi gộp ước tính (theo giá vốn)"
                  value={formatVnd(order.lines.reduce((a, l) => a + l.lineTotal, 0) - cost)}
                />
              )}
            </Section>
            <Section title="Thanh toán">
              <Row label="Khách đã trả" value={formatVnd(order.paidAmount)} />
              {isMarketplace ? (
                <p className="mt-2 text-xs text-slate-500">
                  Đơn sàn: tiền do {order.channel.name} thu và chuyển về sau đối soát, không phải COD. Số
                  &quot;đã trả&quot; và &quot;cần thu&quot; từ KiotViet với đơn sàn thường không phản ánh
                  thanh toán thật.
                </p>
              ) : (
                <Row label="Còn cần thu (COD)" value={formatVnd(toCollect)} strong />
              )}
              {order.platformFee > 0 && (
                <>
                  <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                  <Row label="Phí sàn" value={formatVnd(order.platformFee)} strong />
                  {Object.entries(order.feeDetail ?? {}).map(([k, v]) => (
                    <Row
                      key={k}
                      label={<span className="text-xs">{FEE_LABEL[k] ?? k.replace(/_/g, ' ')}</span>}
                      value={formatVnd(v)}
                    />
                  ))}
                </>
              )}
              <p className="mt-3 text-xs text-slate-500">Đối soát chi tiết sẽ có ở P4-05.</p>
            </Section>
          </div>

          <Section title="Ghi chú">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {order.internalNote ?? <span className="text-slate-400">Chưa có ghi chú nội bộ.</span>}
            </p>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Thông tin">
            <Row label="Mã đơn sàn" value={order.externalCode ?? '–'} />
            <Row label="Mã hóa đơn KiotViet" value={order.kiotvietInvoiceCode ?? '–'} />
            <Row label="Tạo lúc" value={dt(order.orderedAt)} />
            <Row label="Hoàn thành" value={dt(order.completedAt)} />
            <Row
              label="Tồn kho"
              value={order.stockAppliedAt ? `Đã trừ ${dt(order.stockAppliedAt)}` : 'Chưa trừ'}
            />
          </Section>

          <Section title="Khách hàng">
            {order.customer ? (
              <button
                onClick={() => open('customer', order.customer!.kiotvietCode ?? order.customer!.id)}
                className="block text-left text-sm hover:underline"
              >
                <p className="font-medium text-brand-700 dark:text-brand-50">
                  {order.customer.name ?? order.customer.kiotvietCode}
                </p>
                <p className="text-slate-500">{order.customer.phone ?? order.customer.kiotvietCode}</p>
              </button>
            ) : (
              <p className="text-sm text-slate-400">Chưa có khách.</p>
            )}
          </Section>

          <Section title="Vận chuyển">
            <Row label="Đơn vị" value={order.carrier ?? '–'} />
            <Row
              label="Mã vận đơn"
              value={<span className="font-mono text-xs">{order.trackingNo ?? '–'}</span>}
            />
            <Row label="Trạng thái giao" value={order.shippingStatus ?? '–'} />
            <Row label="Hạn bàn giao" value={dt(order.shipByAt)} />
            <div className="mt-1 text-sm">
              <p className="text-slate-500">Địa chỉ nhận</p>
              <p className="mt-0.5">
                {order.shipAddress ?? order.shipProvince ?? <span className="text-slate-400">–</span>}
              </p>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
