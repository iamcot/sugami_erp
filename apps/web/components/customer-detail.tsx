'use client';

import { formatVnd } from '@sugami/shared';
import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type CustomerSaved, useDetail } from '@/components/detail-drawer';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { AreaSelect } from '@/components/vn-area-select';
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
    note: string | null;
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

interface Form {
  name: string;
  phone: string;
  email: string;
  addressLine: string;
  region: string;
  ward: string;
  note: string;
}

const toSaved = (c: Detail['customer']): CustomerSaved => ({
  id: c.id,
  code: c.code,
  name: c.name,
  phone: c.phone,
  email: c.email,
  addressLine: c.addressLine,
  region: c.region,
  ward: c.ward,
  kvDebt: c.kvDebt,
});

/** Code `new` = the create form (nothing to load); otherwise the customer's view with an edit form. */
export function CustomerDetail({ code, embedded }: { code: string; embedded?: boolean }) {
  const { open, close, optsFor } = useDetail();
  const isNew = code === 'new';
  const opts = optsFor('customer', code);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Form | null>(
    isNew
      ? {
          name: opts?.initial?.name ?? '',
          phone: opts?.initial?.phone ?? '',
          email: opts?.initial?.email ?? '',
          addressLine: opts?.initial?.addressLine ?? '',
          region: opts?.initial?.region ?? '',
          ward: opts?.initial?.ward ?? '',
          note: '',
        }
      : null,
  );
  const [saving, setSaving] = useState(false);
  /** The phone typed for a new customer already belongs to this one. */
  const [dup, setDup] = useState<Detail['customer'] | null>(null);

  useEffect(() => {
    if (isNew) return;
    api<Detail>(`/customers/${encodeURIComponent(code)}`)
      .then(setD)
      .catch((e: Error) => setError(e.message));
  }, [code, isNew]);

  if (error && !edit) return <p className="text-sm text-rose-600">{error}</p>;
  if (!d && !isNew) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const c = d?.customer;

  const body = (f: Form) => ({
    name: f.name || null,
    phone: f.phone || null,
    email: f.email || null,
    addressLine: f.addressLine || null,
    region: f.region || null,
    ward: f.ward || null,
    note: f.note || null,
  });
  const save = async () => {
    if (!edit) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const r = await api<{ customer: Detail['customer']; existing: boolean }>('/customers', {
          method: 'POST',
          json: body(edit),
        });
        if (r.existing) {
          setDup(r.customer);
          return;
        }
        opts?.onSaved?.(toSaved(r.customer));
        close();
        return;
      }
      const next = await api<Detail>(`/customers/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        json: body(edit),
      });
      setD(next);
      setEdit(null);
      opts?.onSaved?.(toSaved(next.customer));
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
        title={isNew ? 'Khách hàng mới' : (c?.name ?? '(chưa có tên)')}
        description={c?.code ?? undefined}
        actions={
          !edit &&
          c && (
            <Button
              variant="secondary"
              onClick={() =>
                setEdit({
                  name: c.name ?? '',
                  phone: c.phone ?? '',
                  email: c.email ?? '',
                  addressLine: c.addressLine ?? '',
                  region: c.region ?? '',
                  ward: c.ward ?? '',
                  note: c.note ?? '',
                })
              }
            >
              <Pencil className="size-4" /> Sửa
            </Button>
          )
        }
      />
      {d && c && (
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
      )}

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
            <div className="md:col-span-2">
              <AreaSelect
                province={edit.region}
                ward={edit.ward}
                onChange={(v) => setEdit({ ...edit, region: v.province, ward: v.ward })}
              />
            </div>
            <label className="text-xs text-slate-500 md:col-span-2">
              Ghi chú
              <textarea
                value={edit.note}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                rows={4}
                maxLength={2000}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </label>
            {error && <p className="text-sm text-rose-600 md:col-span-2">{error}</p>}
            {dup && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                <p>
                  Số điện thoại <b>{dup.phone}</b> đã có trong danh sách khách:{' '}
                  <b>{dup.name ?? '(không tên)'}</b>
                  {dup.code ? ` (${dup.code})` : ''}
                  {dup.addressLine ? `, ${dup.addressLine}` : ''}. Chưa tạo khách mới.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    onClick={() => {
                      opts?.onSaved?.(toSaved(dup));
                      close();
                    }}
                  >
                    Dùng khách này
                  </Button>
                  <Button variant="secondary" onClick={() => setDup(null)}>
                    Sửa số điện thoại
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={saving} onClick={save}>
                Lưu
              </Button>
              <Button variant="secondary" onClick={() => (isNew ? close() : setEdit(null))}>
                Hủy
              </Button>
              {!isNew && (
                <span className="self-center text-xs text-slate-500">
                  Nhập lại file khách từ KiotViet có thể ghi đè các thông tin này.
                </span>
              )}
            </div>
          </div>
        ) : c ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Điện thoại" value={c.phone} />
            <Field label="Email" value={c.email} />
            <Field label="Facebook" value={c.facebook} />
            <Field label="Địa chỉ" value={[c.addressLine, c.ward, c.region].filter(Boolean).join(', ')} />
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Ghi chú" value={c.note && <p className="whitespace-pre-wrap">{c.note}</p>} />
            </div>
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
        ) : null}
      </Card>

      {d && (
        <>
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
      )}
    </>
  );
}
