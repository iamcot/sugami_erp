'use client';

import { cn } from '@sugami/ui';
import { ArrowLeft, CheckCheck, CornerDownLeft, RefreshCw, Search, Star } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { PlatformDiamond } from '@/components/platform-icons';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeDateTime } from '@/lib/datetime';
import { useQueryState } from '@/lib/use-query-state';

interface Conversation {
  id: string;
  channel: string;
  kind: string;
  customerName: string;
  snippet: string;
  seen: boolean;
  lastSentByShop: boolean | null;
  /** The buyer wrote last and nobody marked it checked. */
  needsAttention: boolean;
  tags: string[];
  updatedAt: string;
}
interface Summary {
  total: number;
  inbox: number;
  rating: number;
  comment: number;
  unread: number;
  waiting: number;
}
interface ListResponse {
  channels: { channel: string; count: number }[];
  errors: { channel: string; message: string }[];
  summary: Summary;
  total: number;
  data: Conversation[];
}
interface Message {
  id: string;
  at: string;
  fromShop: boolean;
  text: string;
  attachments: string[];
}

const PAGE_SIZE = 30;
/** The list reloads itself this often (seconds) while the tab is open. */
const AUTO_RELOAD_SECONDS = 60;

const CHANNEL_LABEL: Record<string, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  other: 'Khác',
};

const RANGES = [
  ['1', '24 giờ qua'],
  ['3', '3 ngày qua'],
  ['7', '7 ngày qua'],
  ['14', '14 ngày qua'],
  ['30', '30 ngày qua'],
] as const;

const ATTACHMENT_LABEL: Record<string, string> = {
  image: '[Ảnh]',
  photo: '[Ảnh]',
  video: '[Video]',
  sticker: '[Nhãn dán]',
  shopee_faq_messages: '[Tin tự động của Shopee]',
  order: '[Đơn hàng]',
  product: '[Sản phẩm]',
};

function Thread({
  conv,
  refreshKey,
  onBack,
  onReview,
}: {
  conv: Conversation;
  refreshKey: number;
  onBack: () => void;
  onReview: (c: Conversation) => void;
}) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);

  // Grow with the text (up to the CSS max height), shrink back after sending.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    setDraft('');
    setSendError(null);
  }, [conv.id]);

  const send = async () => {
    if (sending || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await api(`/chat/conversations/${encodeURIComponent(conv.id)}/messages`, {
        method: 'POST',
        json: { text: draft.trim() },
      });
      setDraft('');
      setReload((n) => n + 1);
      box.current?.focus();
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const shownConv = useRef<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    // Only blank the thread when another conversation opens, not on a refresh or after sending.
    if (shownConv.current !== conv.id) {
      shownConv.current = conv.id;
      setMsgs(null);
    }
    setError(null);
    api<{ data: Message[] }>(`/chat/conversations/${encodeURIComponent(conv.id)}/messages`, {
      signal: ctrl.signal,
    })
      .then((r) => setMsgs(r.data))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => ctrl.abort();
  }, [conv.id, reload, refreshKey]);

  return (
    <Card className="flex h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-700/60">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1 text-slate-500 hover:bg-white/70 lg:hidden dark:hover:bg-white/10"
          aria-label="Về danh sách"
        >
          <ArrowLeft className="size-4" />
        </button>
        <PlatformDiamond platform={conv.channel} className="size-6" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{conv.customerName || '(không tên)'}</p>
          <p className="font-mono text-[11px] text-slate-500">{conv.id}</p>
        </div>
        {conv.kind === 'RATING' && <Badge tone="warn">Đánh giá</Badge>}
        {conv.kind === 'COMMENT' && <Badge>Bình luận</Badge>}
        {conv.needsAttention && (
          <Button variant="secondary" className="ml-auto" onClick={() => onReview(conv)}>
            <CheckCheck className="size-4" /> Đã kiểm tra
          </Button>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!msgs && !error && <p className="text-sm text-slate-500">Đang tải…</p>}
        {msgs && !msgs.length && (
          <p className="text-sm text-slate-500">
            {conv.kind === 'RATING'
              ? `Đánh giá của khách: ${conv.snippet || '–'}`
              : 'Hội thoại chưa có tin nhắn.'}
          </p>
        )}
        {msgs?.map((m) => (
          <div key={m.id} className={cn('flex', m.fromShop ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] rounded-xl px-3 py-2 text-sm',
                m.fromShop
                  ? 'bg-brand-500/15 text-slate-800 dark:text-slate-100'
                  : 'border border-slate-200/80 bg-white/70 dark:border-slate-700 dark:bg-white/5',
              )}
            >
              {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
              {m.attachments.map((a, i) => (
                <p key={`${a}-${i}`} className="text-xs italic text-slate-500">
                  {ATTACHMENT_LABEL[a] ?? `[${a}]`}
                </p>
              ))}
              <p className="mt-1 text-right text-[10px] text-slate-500">{formatRelativeDateTime(m.at)}</p>
            </div>
          </div>
        ))}
      </div>
      {conv.kind === 'INBOX' ? (
        <div className="space-y-2 border-t border-slate-200/70 px-4 py-3 dark:border-slate-700/60">
          {sendError && <p className="text-sm text-rose-600">{sendError}</p>}
          <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white/80 py-2 pl-3 pr-2 focus-within:border-brand-500 dark:border-slate-700 dark:bg-white/5">
            <textarea
              ref={box}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line; Enter that confirms Vietnamese IME text is left alone.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={2000}
              rows={1}
              placeholder="Nhập tin trả lời khách…"
              className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              aria-label="Gửi (Enter)"
              title="Gửi (Enter)"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-white/10 dark:disabled:text-slate-500"
            >
              {sending ? <RefreshCw className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Nhấn <b>Enter</b> để gửi · <b>Shift + Enter</b> để xuống dòng
          </p>
        </div>
      ) : (
        <p className="border-t border-slate-200/70 px-4 py-2 text-xs text-slate-500 dark:border-slate-700/60">
          Đánh giá và bình luận chỉ xem, trả lời làm trên sàn hoặc Facebook.
        </p>
      )}
    </Card>
  );
}

function ChatList() {
  const [qs, setQs] = useQueryState({
    channel: '',
    kind: '',
    filter: '',
    q: '',
    days: '7',
    page: '1',
    c: '',
  });
  const [search, setSearch] = useState(qs.q);
  const [res, setRes] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [countdown, setCountdown] = useState(AUTO_RELOAD_SECONDS);

  // Reload by itself every minute while the tab is visible; any reload (by hand or timer) restarts the count.
  useEffect(() => setCountdown(AUTO_RELOAD_SECONDS), [reload]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setCountdown((n) => n - 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (countdown <= 0) setReload((n) => n + 1);
  }, [countdown]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== qs.q) setQs({ q: search, page: '1' });
    }, 300);
    return () => clearTimeout(t);
  }, [search, qs.q, setQs]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      days: qs.days,
      page: qs.page,
      pageSize: String(PAGE_SIZE),
      ...(qs.channel ? { channel: qs.channel } : {}),
      ...(qs.kind ? { kind: qs.kind } : {}),
      ...(qs.filter === 'unread' ? { unread: '1' } : {}),
      ...(qs.filter === 'waiting' ? { waiting: '1' } : {}),
      ...(qs.q ? { q: qs.q } : {}),
    });
    api<ListResponse>(`/chat/conversations?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setRes(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [qs.channel, qs.kind, qs.filter, qs.q, qs.days, qs.page, reload]);

  // "Đã kiểm tra": silences this chat until the buyer writes again. Shown as done at once, then saved.
  const review = (c: Conversation) => {
    setRes((r) =>
      r
        ? {
            ...r,
            summary: { ...r.summary, waiting: Math.max(0, r.summary.waiting - (c.needsAttention ? 1 : 0)) },
            data: r.data.map((x) => (x.id === c.id ? { ...x, needsAttention: false } : x)),
          }
        : r,
    );
    api(`/chat/conversations/${encodeURIComponent(c.id)}/review`, { method: 'POST', json: { at: c.updatedAt } }).catch(
      (e: Error) => {
        setError(e.message);
        setReload((n) => n + 1);
      },
    );
  };

  const selected = res?.data.find((c) => c.id === qs.c) ?? null;
  const s = res?.summary;
  const pages = res ? Math.max(1, Math.ceil(res.total / PAGE_SIZE)) : 1;

  const chip = (label: string, active: boolean, onClick: () => void, count?: number) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition',
        active
          ? 'border-brand-500/70 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500'
          : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-white/5 dark:text-slate-300',
      )}
    >
      {label}
      {count !== undefined && <span className="font-mono text-[11px] opacity-70">{count}</span>}
    </button>
  );

  const select =
    'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900';
  const reset = { page: '1', c: '' };

  return (
    <>
      <PageHeader
        title="Chat"
        description={s ? `${s.inbox} chat · ${s.rating} đánh giá trong ${qs.days} ngày qua` : 'Đọc từ Pancake'}
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">
              Tự động tải lại sau <b className="tabular-nums">{Math.max(countdown, 0)}</b> giây
            </span>
            <Button variant="secondary" onClick={() => setReload((n) => n + 1)} disabled={loading}>
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> Tải lại
            </Button>
          </div>
        }
      />
      {res && res.channels.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {chip('Mọi kênh', !qs.channel, () => setQs({ channel: '', ...reset }))}
          {res.channels.map((ch) => (
            <button
              key={ch.channel}
              type="button"
              onClick={() => setQs({ channel: ch.channel, ...reset })}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border pl-1.5 pr-3 text-sm transition',
                qs.channel === ch.channel
                  ? 'border-brand-500/70 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500'
                  : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-white/5 dark:text-slate-300',
              )}
            >
              <PlatformDiamond platform={ch.channel} className="size-5" />
              {CHANNEL_LABEL[ch.channel] ?? ch.channel}
              <span className="font-mono text-[11px] opacity-70">{ch.count}</span>
            </button>
          ))}
        </div>
      )}
      {res?.errors.map((e) => (
        <p key={e.channel} className="mb-2 text-sm text-rose-600">
          Không đọc được chat {CHANNEL_LABEL[e.channel] ?? e.channel}: {e.message}
        </p>
      ))}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip('Tất cả', !qs.kind && !qs.filter, () => setQs({ kind: '', filter: '', ...reset }), s?.total)}
        {chip('Chat', qs.kind === 'INBOX', () => setQs({ kind: 'INBOX', filter: '', ...reset }), s?.inbox)}
        {chip('Đánh giá', qs.kind === 'RATING', () => setQs({ kind: 'RATING', filter: '', ...reset }), s?.rating)}
        {s && s.comment > 0 && chip('Bình luận', qs.kind === 'COMMENT', () => setQs({ kind: 'COMMENT', filter: '', ...reset }), s.comment)}
        {chip('Chưa đọc', qs.filter === 'unread', () => setQs({ kind: '', filter: 'unread', ...reset }), s?.unread)}
        {chip(
          'Cần xem',
          qs.filter === 'waiting',
          () => setQs({ kind: '', filter: 'waiting', ...reset }),
          s?.waiting,
        )}
        <select value={qs.days} onChange={(e) => setQs({ days: e.target.value, ...reset })} className={cn(select, 'ml-auto')}>
          {RANGES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm sm:w-64 dark:border-slate-800 dark:bg-slate-900">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên khách, nội dung"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={cn(selected && 'hidden lg:block')}>
          <Card className="divide-y divide-slate-200/70 overflow-hidden dark:divide-slate-700/60">
            {loading && !res && <p className="p-4 text-sm text-slate-500">Đang tải…</p>}
            {res && !res.data.length && (
              <p className="p-4 text-sm text-slate-500">Không có hội thoại nào khớp bộ lọc.</p>
            )}
            {res?.data.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setQs({ c: c.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setQs({ c: c.id });
                  }
                }}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition hover:bg-white/60 dark:hover:bg-white/5',
                  c.id === qs.c && 'bg-brand-500/10',
                )}
              >
                <PlatformDiamond platform={c.channel} className="mt-0.5 size-5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('truncate', (c.needsAttention || !c.seen) && 'font-semibold')}>
                      {c.customerName || '(không tên)'}
                    </span>
                    {c.kind === 'RATING' && <Star className="size-3.5 shrink-0 text-amber-500" aria-label="Đánh giá" />}
                    {c.needsAttention ? (
                      <Badge tone="warn">Cần xem</Badge>
                    ) : (
                      !c.seen && <span className="size-2 shrink-0 rounded-full bg-brand-500" aria-label="Chưa đọc" />
                    )}
                  </span>
                  <span className="block truncate text-sm text-slate-600 dark:text-slate-400">
                    {c.lastSentByShop ? 'Shop: ' : ''}
                    {c.snippet || '–'}
                  </span>
                  {c.tags.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="whitespace-nowrap text-xs text-slate-500">{formatRelativeDateTime(c.updatedAt)}</span>
                  {c.needsAttention && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        review(c);
                      }}
                      title="Đã kiểm tra: tắt cảnh báo cho đến khi khách nhắn tiếp"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300/80 bg-white/70 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-white/5 dark:text-slate-300"
                    >
                      <CheckCheck className="size-3" /> Đã kiểm tra
                    </button>
                  )}
                </span>
              </div>
            ))}
          </Card>
          {res && pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <Button variant="secondary" disabled={Number(qs.page) <= 1} onClick={() => setQs({ page: String(Number(qs.page) - 1) })}>
                Trước
              </Button>
              <span className="text-slate-500">
                Trang {qs.page}/{pages}
              </span>
              <Button variant="secondary" disabled={Number(qs.page) >= pages} onClick={() => setQs({ page: String(Number(qs.page) + 1) })}>
                Sau
              </Button>
            </div>
          )}
        </div>
        <div className={cn(!selected && 'hidden lg:block')}>
          {selected ? (
            <Thread conv={selected} refreshKey={reload} onBack={() => setQs({ c: '' })} onReview={review} />
          ) : (
            <Card className="flex h-48 items-center justify-center text-sm text-slate-500">
              Chọn một hội thoại để xem tin nhắn.
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatList />
    </Suspense>
  );
}
