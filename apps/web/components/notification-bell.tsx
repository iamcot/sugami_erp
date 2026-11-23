'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  createdAt: string;
}

const SEEN_KEY = 'sugami:notifications-seen';
const readSeen = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
};
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.floor(m / 60)} giờ trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

/** The bell: what the background jobs did (new orders, status changes, errors). Unread = newer than last opened. */
export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [seen, setSeen] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(
    () =>
      api<{ data: Item[] }>('/notifications?limit=50').then(
        (r) => setItems(r.data),
        () => {},
      ),
    [],
  );
  useEffect(() => {
    setSeen(readSeen());
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((i) => Date.parse(i.createdAt) > seen).length;
  const toggle = () => {
    if (!open) void load();
    if (open) {
      const now = Date.now();
      try {
        localStorage.setItem(SEEN_KEY, String(now));
      } catch {
        /* private window: the badge simply comes back */
      }
      setSeen(now);
    }
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative rounded-md p-2 text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10"
        aria-label="Thông báo"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-20 cursor-default" aria-label="Đóng" onClick={toggle} />
          <div className="absolute right-0 top-full z-30 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-medium dark:border-slate-800">
              Thông báo
            </div>
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {items.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-500">Chưa có thông báo nào.</li>
              )}
              {items.map((i) => {
                const isNew = Date.parse(i.createdAt) > seen;
                const inner = (
                  <>
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${i.kind === 'error' ? 'bg-rose-500' : isNew ? 'bg-brand-500' : 'bg-transparent'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${isNew ? 'font-medium' : ''}`}>{i.title}</span>
                      {i.body && <span className="block truncate text-xs text-slate-500">{i.body}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{ago(i.createdAt)}</span>
                  </>
                );
                return (
                  <li key={i.id}>
                    {i.url ? (
                      <Link
                        href={i.url}
                        onClick={toggle}
                        className="flex gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex gap-2 px-4 py-2.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
