'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Me {
  user: { name: string; email: string; roles: string[] };
}

export function UserMenu() {
  const router = useRouter();
  const [me, setMe] = useState<Me['user'] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<Me>('/auth/me')
      .then((r) => setMe(r.user))
      .catch(() => {
        // Session expired or revoked: go back to login.
        router.replace('/login');
      });
  }, [router]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  const initials = (me?.name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(-2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700"
        aria-label="Tài khoản"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{me?.name}</p>
            <p className="truncate text-xs text-slate-500">{me?.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogOut className="size-4" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
