'use client';

import { useState } from 'react';

/** Brand colours of the carriers; anything else gets the neutral grey. */
const BRAND: Record<string, string> = {
  spx: 'bg-orange-500 text-white',
  ghn: 'bg-orange-600 text-white',
  ghtk: 'bg-green-600 text-white',
  jt: 'bg-red-600 text-white',
  ahamove: 'bg-yellow-400 text-slate-900',
  grab: 'bg-green-500 text-white',
  lalamove: 'bg-orange-500 text-white',
  viettelpost: 'bg-red-700 text-white',
  vnpost: 'bg-amber-500 text-white',
  bestexpress: 'bg-yellow-500 text-slate-900',
  ntl: 'bg-sky-600 text-white',
  gsm: 'bg-sky-500 text-white',
};

/**
 * Carrier mark. Uses the logo file `public/carriers/<id>.png` when the shop has put one there,
 * otherwise a badge in the carrier's colour with its initials.
 */
export function CarrierLogo({
  id,
  name,
  className = 'size-9',
}: {
  id: string;
  name?: string | null;
  className?: string;
}) {
  const [missing, setMissing] = useState(false);
  const key = id.toLowerCase();
  if (!missing)
    return (
      <img
        src={`/carriers/${encodeURIComponent(key)}.png`}
        alt={name ?? id}
        className={`${className} shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-slate-200 dark:ring-white/10`}
        onError={() => setMissing(true)}
      />
    );
  const initials = (name ?? id)
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .slice(0, 2);
  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-md text-xs font-bold uppercase ${BRAND[key] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}
    >
      {initials}
    </span>
  );
}
