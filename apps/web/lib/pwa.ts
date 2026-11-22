'use client';

import { api } from './api';

/** Chrome/Android install prompt event (not in the TS DOM lib). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission, subscribe this device and register it with the API. */
export async function enablePush(): Promise<void> {
  const { publicKey } = await api<{ publicKey: string | null }>('/push/config');
  if (!publicKey) throw new Error('Máy chủ chưa cấu hình thông báo (VAPID).');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error('Bạn chưa cho phép thông báo. Mở cài đặt trình duyệt để bật lại.');
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker());
  if (!reg) throw new Error('Không đăng ký được service worker.');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
    } catch {
      throw new Error(
        isIos() && !isStandalone()
          ? 'Trên iPhone phải mở Sugami từ màn hình chính mới bật được thông báo.'
          : 'Trình duyệt này không đăng ký được thông báo (chế độ ẩn danh hoặc bị chặn). Thử Chrome/Safari thường.',
      );
    }
  }
  await api('/push/subscriptions', { method: 'POST', json: sub.toJSON() });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api('/push/subscriptions', { method: 'DELETE', json: { endpoint: sub.endpoint } }).catch(
    () => undefined,
  );
  await sub.unsubscribe();
}
