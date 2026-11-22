'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShopeeIcon, TikTokIcon } from '@/components/platform-icons';
import { Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';

type Channel = 'base' | 'shopee' | 'tiktok';
interface Version {
  title: string | null;
  description: string | null;
}
type Contents = Record<Channel, Version | null>;

/** Title limits of each marketplace; the master text has none. */
const TITLE_MAX: Record<Channel, number> = { base: 255, shopee: 120, tiktok: 255 };
const TABS: { id: Channel; label: string }[] = [
  { id: 'base', label: 'Nội dung gốc' },
  { id: 'shopee', label: 'Shopee' },
  { id: 'tiktok', label: 'TikTok' },
];

/** Master text per product, plus an optional own version for each marketplace. */
export function ProductContent({
  code,
  fallbackDescription,
}: {
  code: string;
  fallbackDescription: string | null;
}) {
  const [data, setData] = useState<Contents | null>(null);
  const [tab, setTab] = useState<Channel>('base');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = `/products/${encodeURIComponent(code)}/content`;
  const load = useCallback(
    () =>
      api<{ contents: Contents }>(url).then(
        (r) => setData(r.contents),
        (e: Error) => setError(e.message),
      ),
    [url],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // fill the form from the saved version; the master falls back to the old product description
  useEffect(() => {
    if (!data) return;
    const v = data[tab];
    setTitle(v?.title ?? '');
    setDescription(v?.description ?? (tab === 'base' ? (fallbackDescription ?? '') : ''));
    setMsg(null);
    setError(null);
  }, [data, tab, fallbackDescription]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`${url}/${tab}`, {
        method: 'PUT',
        json: { title: title.trim() || null, description: description || null },
      });
      await load();
      setMsg('Đã lưu');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const max = TITLE_MAX[tab];
  const own = (c: Channel) => Boolean(data?.[c]);

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <span className="text-sm font-medium">Nội dung</span>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-slate-100 dark:bg-slate-800' : 'text-slate-500'}`}
            >
              {t.id === 'shopee' && <ShopeeIcon className="size-4" />}
              {t.id === 'tiktok' && <TikTokIcon className="size-4" />}
              {t.id === 'base'
                ? t.label
                : !own(t.id) && <span className="text-xs text-slate-400">dùng gốc</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4">
        {!data ? (
          <p className="text-sm text-slate-500">Đang tải…</p>
        ) : (
          <>
            {tab !== 'base' && !own(tab) && (
              <p className="text-sm text-slate-500">
                Chưa soạn riêng cho sàn này, đang dùng nội dung gốc.{' '}
                <button
                  className="font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setTitle(data.base?.title ?? '');
                    setDescription(data.base?.description ?? fallbackDescription ?? '');
                  }}
                >
                  Chép nội dung gốc vào để sửa
                </button>
              </p>
            )}
            <label className="block text-sm">
              <span className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                Tiêu đề
                <span
                  className={`text-xs tabular-nums ${title.length > max ? 'text-rose-600' : 'text-slate-400'}`}
                >
                  {title.length}/{max}
                </span>
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Mô tả</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void save()} disabled={busy || title.length > max}>
                {busy ? 'Đang lưu…' : 'Lưu'}
              </Button>
              {tab !== 'base' && own(tab) && (
                <button
                  className="text-sm text-slate-500 hover:text-rose-600"
                  onClick={() => {
                    setTitle('');
                    setDescription('');
                  }}
                >
                  Xóa để dùng lại nội dung gốc (bấm Lưu)
                </button>
              )}
              {msg && <Badge tone="success">{msg}</Badge>}
              {error && <span className="text-sm text-rose-600">{error}</span>}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
