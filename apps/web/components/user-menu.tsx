'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { loadMe, type Me, resetMe } from '@/lib/me';
import { AppSettings } from './app-settings';

export function UserMenu() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click anywhere outside (which includes opening the bell, so the two pop-ups never stack) or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => {
    loadMe()
      .then(setMe)
      .catch(() => {
        // Session expired or revoked: go back to login.
        router.replace('/login');
      });
  }, [router]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    resetMe();
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
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 text-slate-700 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-white/10"
        aria-label="Tài khoản"
      >
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-b from-violet-300 to-violet-500 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(139,92,246,0.35)]">
          {initials}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium md:block">{me?.name}</span>
      </button>
      {open && (
        <div className="popover absolute right-0 top-11 z-20 w-56 rounded-xl border text-slate-900 dark:text-slate-100 border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{me?.name}</p>
            <p className="truncate text-xs text-slate-500">{me?.email}</p>
            {me && (
              <p className="mt-1 truncate text-xs font-medium text-brand-700 dark:text-brand-500">
                Shop {me.shop.name}
              </p>
            )}
          </div>
          <AppSettings />
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
