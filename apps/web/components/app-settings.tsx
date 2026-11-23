'use client';

import { Bell, BellOff, Download, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  type BeforeInstallPromptEvent,
  currentSubscription,
  disablePush,
  enablePush,
  isIos,
  isStandalone,
  pushSupported,
  registerServiceWorker,
} from '@/lib/pwa';

let installEvent: BeforeInstallPromptEvent | null = null;

/** Registers the service worker and keeps Chrome's install prompt for the "Cài app" button. */
export function PwaBootstrap() {
  useEffect(() => {
    void registerServiceWorker();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installEvent = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  return null;
}

const item =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800';

/** Menu items: install the app, turn notifications on/off on this device, send a test. */
export function AppSettings() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const standalone = isStandalone();
  const ios = isIos();

  /** What this device really has (not what we assume after a click): re-read after every action and on return to the app. */
  const refresh = () =>
    currentSubscription().then(
      (s) => setSubscribed(Boolean(s)),
      () => setSubscribed(false),
    );
  useEffect(() => {
    setCanInstall(Boolean(installEvent));
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const m = await fn();
      if (m) setMsg(m);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-slate-100 py-1 dark:border-slate-800">
      {!standalone && canInstall && (
        <button
          className={item}
          onClick={() =>
            run(async () => {
              await installEvent?.prompt();
              installEvent = null;
              setCanInstall(false);
            })
          }
        >
          <Download className="size-4" /> Cài Sugami lên máy
        </button>
      )}
      {!standalone && ios && (
        <p className="px-3 py-2 text-xs text-slate-500">
          iPhone: bấm nút Chia sẻ rồi chọn &quot;Thêm vào MH chính&quot;, mở Sugami từ màn hình chính để bật
          thông báo.
        </p>
      )}
      {pushSupported() && blocked && (
        <p className="px-3 py-2 text-xs text-rose-600">
          Thông báo đang bị chặn cho Sugami. Mở cài đặt trình duyệt hoặc cài đặt ứng dụng của máy để cho phép,
          rồi quay lại đây.
        </p>
      )}
      {pushSupported() && subscribed !== null && (
        <p className="px-3 pt-2 text-xs text-slate-500">
          Thông báo trên máy này: <b>{subscribed ? 'đang bật' : 'chưa bật'}</b>
        </p>
      )}
      {pushSupported() && subscribed === false && (
        <button
          className={item}
          disabled={busy}
          onClick={() =>
            run(async () => {
              await enablePush();
              await refresh();
              return 'Đã bật thông báo trên thiết bị này.';
            })
          }
        >
          <Bell className="size-4" /> Bật thông báo
        </button>
      )}
      {subscribed && (
        <>
          <button
            className={item}
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await api<{ sent: number }>('/push/test', { method: 'POST' });
                return r.sent ? 'Đã gửi, chờ vài giây.' : 'Không gửi được, thử tắt rồi bật lại.';
              })
            }
          >
            <Send className="size-4" /> Gửi thông báo thử
          </button>
          <button
            className={item}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await disablePush();
                await refresh();
              })
            }
          >
            <BellOff className="size-4" /> Tắt thông báo
          </button>
        </>
      )}
      {!pushSupported() && !ios && (
        <p className="px-3 py-2 text-xs text-slate-500">Trình duyệt này không hỗ trợ thông báo.</p>
      )}
      {msg && <p className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400">{msg}</p>}
    </div>
  );
}
