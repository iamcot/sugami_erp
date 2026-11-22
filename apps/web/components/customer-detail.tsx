'use client';

import { formatVnd } from '@sugami/shared';
import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDetail } from '@/components/detail-drawer';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface Detail {
  customer: {
    id: string;
    code: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    gender: string | null;
    birthday: string | null;
    facebook: string | null;
    addressLine: string | null;
    region: string | null;
    ward: string | null;
    tags: string[];
    isActive: boolean;
    kvCreatedAt: string | null;
    lastPurchaseAt: string | null;
    kvTotalSales: number;
    kvDebt: number;
  };
  stats: { orders: number; spent: number; lastOrderAt: string | null };
  orders: {
    id: string;
    code: string;
    channel: { code: string; name: string };
    status: string;
    total: number;
    orderedAt: string;
    items: { sku: string; name: string; qty: number }[];
  }[];
}

const STATUS: Record<string, string> = {
  new: 'Mới',
  confirmed: 'Đã xác nhận',
  packing: 'Đang đóng gói',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  returned: 'Trả hàng',
};

const dt = (s: string | null, time = false) =>
  s
    ? new Date(s).toLocaleString('vi-VN', {
        dateStyle: 'short',
        ...(time ? { timeStyle: 'short' as const } : {}),
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    : '–';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-slate-400">–</span>}</dd>
    </div>
  );
}

export function CustomerDetail({ code, embedded }: { code: string; embedded?: boolean }) {
  const { open } = useDetail();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    name: string;
    phone: string;
    email: string;
    addressLine: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Detail>(`/customers/${encodeURIComponent(code)}`)
      .then(setD)
      .catch((e: Error) => setError(e.message));
  }, [code]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const c = d.customer;

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      setD(
        await api<Detail>(`/customers/${encodeURIComponent(code)}`, {
          method: 'PATCH',
          json: {
            name: edit.name || null,
            phone: edit.phone || null,
            email: edit.email || null,
            addressLine: edit.addressLine || null,
          },
        }),
      );
      setEdit(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const input =
    'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900';

  return (
    <>
      <PageHeader
        title={c.name ?? '(chưa có tên)'}
        description={c.code ?? undefined}
        actions={
          !edit && (
            <Button
              variant="secondary"
              onClick={() =>
                setEdit({
                  name: c.name ?? '',
                  phone: c.phone ?? '',
                  email: c.email ?? '',
                  addressLine: c.addressLine ?? '',
                })
              }
            >
              <Pencil className="size-4" /> Sửa
            </Button>
          )
        }
      />
      <div className={`mb-4 grid grid-cols-2 gap-3 ${embedded ? '' : 'md:grid-cols-4'}`}>
        {[
          ['Đơn trong Sugami', String(d.stats.orders)],
          ['Chi tiêu trong Sugami', formatVnd(d.stats.spent)],
          ['Tổng mua (KiotViet)', formatVnd(c.kvTotalSales)],
          ['Nợ cần thu', formatVnd(c.kvDebt)],
        ].map(([l, v]) => (
          <Card key={l} className="p-3">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-4 p-4">
        {edit ? (
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['name', 'Tên'],
                ['phone', 'Điện thoại'],
                ['email', 'Email'],
                ['addressLine', 'Địa chỉ'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="text-xs text-slate-500">
                {label}
                <input
                  value={edit[k]}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  className={input}
                />
              </label>
            ))}
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={saving} onClick={save}>
                Lưu
              </Button>
              <Button variant="secondary" onClick={() => setEdit(null)}>
                Hủy
              </Button>
              <span className="self-center text-xs text-slate-500">
                Nhập lại file khách từ KiotViet có thể ghi đè các thông tin này.
              </span>
            </div>
          </div>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Điện thoại" value={c.phone} />
            <Field label="Email" value={c.email} />
            <Field label="Facebook" value={c.facebook} />
            <Field label="Địa chỉ" value={[c.addressLine, c.ward, c.region].filter(Boolean).join(', ')} />
            <Field label="Giới tính" value={c.gender} />
            <Field label="Ngày sinh" value={c.birthday && dt(c.birthday)} />
            <Field label="Tạo trên KiotViet" value={dt(c.kvCreatedAt)} />
            <Field label="Mua gần nhất" value={dt(c.lastPurchaseAt)} />
            <Field
              label="Nhóm"
              value={
                c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                )
              }
            />
          </dl>
        )}
      </Card>

      <h2 className="mb-2 text-sm font-medium">Đơn hàng ({d.orders.length})</h2>
      <Card className="overflow-hidden">
        {d.orders.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            Chưa có đơn nào trong Sugami. Nhập file hóa đơn từ KiotViet để thấy lịch sử mua.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2">Mã đơn</th>
                <th className="px-4 py-2">Thời gian</th>
                <th className="hidden px-4 py-2 md:table-cell">Hàng</th>
                <th className="px-4 py-2 text-right">Tổng</th>
                <th className="px-4 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {d.orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => open('order', o.code)}
                      className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-50"
                    >
                      {o.code}
                    </button>
                    <div className="text-xs text-slate-500">{o.channel.name}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{dt(o.orderedAt, true)}</td>
                  <td className="hidden px-4 py-2 md:table-cell">
                    {o.items.slice(0, 2).map((i, n) => (
                      <p key={`${i.sku}-${n}`} className="line-clamp-1">
                        <span className="tabular-nums text-slate-500">{i.qty}×</span> {i.name}
                      </p>
                    ))}
                    {o.items.length > 2 && (
                      <p className="text-xs text-slate-500">+{o.items.length - 2} mặt hàng</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {formatVnd(o.total)}
                  </td>
                  <td className="px-4 py-2">{STATUS[o.status] ?? o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
