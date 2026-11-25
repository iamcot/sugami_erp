'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Field, inputCls } from '@/components/product-form-parts';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeDateTime } from '@/lib/datetime';
import { useMe } from '@/lib/me';

interface UserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: { code: string; name: string }[];
}

const ROLES = [
  ['owner', 'Chủ shop'],
  ['operations', 'Vận hành / CSKH'],
  ['warehouse', 'Nhân viên kho'],
  ['content', 'Content'],
  ['purchasing', 'Mua hàng'],
] as const;

const empty = { name: '', email: '', password: '', role: 'operations' };

/** Accounts of the logged-in user's shop; new ones join the same shop. */
export default function UsersPage() {
  const me = useMe();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api<{ data: UserRow[] }>('/users').then(
      (r) => setRows(r.data),
      (e: Error) => setMsg({ ok: false, text: e.message }),
    );
  }, [version]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/users', {
        method: 'POST',
        json: { name: form.name, email: form.email, password: form.password, roles: [form.role] },
      });
      setMsg({ ok: true, text: `Đã tạo tài khoản ${form.email}.` });
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

  return (
    <>
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Cài đặt
      </Link>
      <PageHeader title="Tài khoản" description={me ? `Nhân viên của shop ${me.shop.name}` : undefined} />
      <Card className="mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2 font-medium">Tên</th>
              <th className="px-4 py-2 font-medium">Vai trò</th>
              <th className="px-4 py-2 font-medium">Đăng nhập gần nhất</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(rows ?? []).map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r.code}>{r.name}</Badge>
                    ))}
                    {!u.isActive && <Badge tone="warn">Đã khóa</Badge>}
                  </div>
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {u.lastLoginAt ? formatRelativeDateTime(u.lastLoginAt) : 'Chưa đăng nhập'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows === null && !msg && <p className="p-4 text-sm text-slate-500">Đang tải…</p>}
      </Card>

      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <h2 className="text-sm font-medium md:col-span-2">Thêm tài khoản</h2>
        <Field label="Tên">
          <input className={inputCls} value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email đăng nhập">
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
          <input className={inputCls} type="password" value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Vai trò">
          <select className={inputCls} value={form.role} onChange={set('role')}>
            {ROLES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button
            disabled={busy || !form.name.trim() || !form.email || form.password.length < 8}
            onClick={() => void create()}
          >
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </Button>
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>
          )}
        </div>
      </Card>
    </>
  );
}
