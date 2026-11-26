'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Field, inputCls } from '@/components/product-form-parts';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { type MeShop, SHOP_TYPE_LABEL, useMe } from '@/lib/me';

interface ShopRow {
  id: string;
  code: string;
  name: string;
  type: MeShop['type'];
  isActive: boolean;
  integrations: boolean;
  users: number;
  owners: { id: string; name: string; email: string; isActive: boolean }[];
  createdAt: string;
}

const empty = {
  name: '',
  code: '',
  type: 'retail' as MeShop['type'],
  ownerName: '',
  email: '',
  password: '',
};

/** Edit one shop and its owner account. */
function EditShop({ shop, onDone }: { shop: ShopRow; onDone: () => void }) {
  const owner = shop.owners[0];
  const [f, setF] = useState({
    name: shop.name,
    type: shop.type,
    isActive: shop.isActive,
    ownerName: owner?.name ?? '',
    email: owner?.email ?? '',
    password: '',
    ownerActive: owner?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/shops/${shop.id}`, {
        method: 'PATCH',
        json: { name: f.name, type: f.type, isActive: f.isActive },
      });
      if (owner)
        await api(`/shops/${shop.id}/users/${owner.id}`, {
          method: 'PATCH',
          json: {
            name: f.ownerName,
            email: f.email,
            isActive: f.ownerActive,
            ...(f.password ? { password: f.password } : {}),
          },
        });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-4 grid gap-3 p-4 md:grid-cols-2">
      <h2 className="text-sm font-medium md:col-span-2">
        Sửa shop <span className="font-mono text-slate-500">{shop.code}</span>
      </h2>
      <Field label="Tên shop">
        <input className={inputCls} value={f.name} onChange={set('name')} />
      </Field>
      <Field label="Loại shop">
        <select className={inputCls} value={f.type} onChange={set('type')}>
          {(Object.keys(SHOP_TYPE_LABEL) as MeShop['type'][]).map((t) => (
            <option key={t} value={t}>
              {SHOP_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input
          type="checkbox"
          checked={f.isActive}
          onChange={(e) => setF((x) => ({ ...x, isActive: e.target.checked }))}
        />
        Shop đang hoạt động (bỏ chọn để tạm khóa, mọi tài khoản của shop bị đăng xuất)
      </label>
      {owner ? (
        <>
          <h3 className="mt-2 text-sm font-medium md:col-span-2">Tài khoản chủ shop</h3>
          <Field label="Tên chủ shop">
            <input className={inputCls} value={f.ownerName} onChange={set('ownerName')} />
          </Field>
          <Field label="Email đăng nhập">
            <input className={inputCls} type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Mật khẩu mới" hint="Để trống nếu không đổi; tối thiểu 8 ký tự">
            <input className={inputCls} type="password" value={f.password} onChange={set('password')} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={f.ownerActive}
              onChange={(e) => setF((x) => ({ ...x, ownerActive: e.target.checked }))}
            />
            Tài khoản đang hoạt động
          </label>
        </>
      ) : (
        <p className="text-sm text-slate-500 md:col-span-2">Shop chưa có tài khoản chủ shop.</p>
      )}
      <div className="flex items-center gap-3 md:col-span-2">
        <Button
          disabled={busy || !f.name.trim() || (!!f.password && f.password.length < 8)}
          onClick={() => void save()}
        >
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Hủy
        </Button>
        {msg && (
          <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>
        )}
      </div>
    </Card>
  );
}

/** Platform admin: list shops and open a new one with its owner account. */
export default function ShopsPage() {
  const me = useMe();
  const [rows, setRows] = useState<ShopRow[] | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: ShopRow[] }>('/shops').then(
      (r) => setRows(r.data),
      (e: Error) => setMsg({ ok: false, text: e.message }),
    );
  }, [version]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ name: string }>('/shops', {
        method: 'POST',
        json: {
          name: form.name,
          code: form.code,
          type: form.type,
          owner: { name: form.ownerName, email: form.email, password: form.password },
        },
      });
      setMsg({ ok: true, text: `Đã tạo shop ${r.name}. Chủ shop đăng nhập bằng ${form.email}.` });
      setForm(empty);
      setVersion((v) => v + 1);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (me && !me.isPlatformAdmin)
    return <p className="text-slate-500">Chỉ quản trị hệ thống xem được trang này.</p>;

  return (
    <>
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Cài đặt
      </Link>
      <PageHeader
        title="Các shop"
        description="Mỗi shop có dữ liệu riêng: sản phẩm, kho, đơn hàng, khách. Tài khoản chỉ thấy shop của mình."
      />
      <Card className="mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2 font-medium">Shop</th>
              <th className="px-4 py-2 font-medium">Loại</th>
              <th className="px-4 py-2 text-right font-medium">Tài khoản</th>
              <th className="px-4 py-2 font-medium">Chủ shop</th>
              <th className="px-4 py-2 font-medium">Kết nối sàn</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(rows ?? []).map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{s.name}</div>
                  <div className="font-mono text-xs text-slate-500">{s.code}</div>
                </td>
                <td className="px-4 py-2">{SHOP_TYPE_LABEL[s.type]}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.users}</td>
                <td className="px-4 py-2">
                  {s.owners[0] ? (
                    <>
                      <div>{s.owners[0].name}</div>
                      <div className="text-xs text-slate-500">{s.owners[0].email}</div>
                    </>
                  ) : (
                    '–'
                  )}
                </td>
                <td className="px-4 py-2">
                  {s.integrations ? <Badge tone="success">Pancake</Badge> : <Badge>Không</Badge>}
                  {!s.isActive && <Badge tone="warn">Tạm khóa</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="secondary" onClick={() => setEditing(s.id)}>
                    Sửa
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows === null && <p className="p-4 text-sm text-slate-500">Đang tải…</p>}
      </Card>

      {rows?.find((x) => x.id === editing) && (
        <EditShop
          key={editing}
          shop={rows.find((x) => x.id === editing)!}
          onDone={() => {
            setEditing(null);
            setVersion((v) => v + 1);
          }}
        />
      )}

      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <h2 className="text-sm font-medium md:col-span-2">Thêm shop mới</h2>
        <Field label="Tên shop">
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Tiệm hoa Hồng" />
        </Field>
        <Field label="Mã shop" hint="Chữ thường, số, dấu gạch ngang">
          <input
            className={`${inputCls} font-mono`}
            value={form.code}
            onChange={(e) =>
              setForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
            }
            placeholder="tiem-hoa-hong"
          />
        </Field>
        <Field
          label="Loại shop"
          hint={
            form.type === 'assembly'
              ? 'Nhập nguyên liệu (hoa, lá, giấy gói…), bán thành phẩm làm từ nguyên liệu'
              : 'Nhập hàng về bán lẻ từng món'
          }
        >
          <select className={inputCls} value={form.type} onChange={set('type')}>
            {(Object.keys(SHOP_TYPE_LABEL) as MeShop['type'][]).map((t) => (
              <option key={t} value={t}>
                {SHOP_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <div />
        <Field label="Tên chủ shop">
          <input className={inputCls} value={form.ownerName} onChange={set('ownerName')} />
        </Field>
        <Field label="Email đăng nhập">
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự; chủ shop đổi lại sau khi đăng nhập">
          <input className={inputCls} type="password" value={form.password} onChange={set('password')} />
        </Field>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button
            disabled={busy || !form.name.trim() || !form.code || !form.email || form.password.length < 8}
            onClick={() => void create()}
          >
            {busy ? 'Đang tạo…' : 'Tạo shop'}
          </Button>
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>
          )}
        </div>
      </Card>
    </>
  );
}
