'use client';

import { useEffect, useState } from 'react';

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

/** Tells the user a newer web version is deployed (installed app keeps the old JS until reload). */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const r = await fetch('/version', { cache: 'no-store' });
        const j = (await r.json()) as { build: string };
        if (j.build !== BUILD) setStale(true);
      } catch {
        // offline: ignore
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(onVisible, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
      Có phiên bản mới.
      <button onClick={() => location.reload()} className="font-semibold text-teal-300 underline">
        Tải lại
      </button>
    </div>
  );
}
