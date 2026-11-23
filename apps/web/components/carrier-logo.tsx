'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Allingo's own logos by carrier id, fetched once for the whole page. */
let iconsPromise: Promise<Record<string, string>> | null = null;
function loadIcons() {
  iconsPromise ??= api<{ data: Record<string, string> }>('/shipping/partner-icons')
    .then((r) => r.data)
    .catch(() => {
      iconsPromise = null;
      return {};
    });
  return iconsPromise;
}

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

/** Carrier id (as Allingo or Ahamove reports it, lowercase) → logo file in `public/carriers`. */
const FILE: Record<string, string> = {
  bestexpress: 'best',
  best: 'best',
  jt: 'jnt',
  jnt: 'jnt',
  viettelpost: 'viettel',
  viettel: 'viettel',
  gsm: 'greensm',
  greensm: 'greensm',
  bedelivery: 'be',
  be: 'be',
  grabexpress: 'grab',
};
/** Best-effort carrier id from a display name such as "SPX Express" or "J&T Express". */
export function carrierIdFromName(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rules: [RegExp, string][] = [
    [/^spx|shopeeexpress/, 'spx'],
    [/^ghn|giaohangnhanh/, 'ghn'],
    [/^ghtk|giaohangtietkiem/, 'ghtk'],
    [/^j(and)?t|jnt/, 'jt'],
    [/^viettel/, 'viettelpost'],
    [/^vnpost|vietnampost/, 'vnpost'],
    [/^best/, 'bestexpress'],
    [/^grab/, 'grab'],
    [/^lalamove/, 'lalamove'],
    [/^ahamove/, 'ahamove'],
    [/^xanh|^gsm|greensm/, 'gsm'],
    [/^ntl/, 'ntl'],
    [/^be/, 'be'],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? n;
}
const fileOf = (id: string) => FILE[id] ?? id;

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
  const [icon, setIcon] = useState<string | null>(null);
  const key = id.toLowerCase();
  useEffect(() => {
    let on = true;
    void loadIcons().then((m) => on && setIcon(m[key] ?? null));
    return () => {
      on = false;
    };
  }, [key]);
  if (!missing)
    return (
      <img
        src={icon ?? `/carriers/${encodeURIComponent(fileOf(key))}.png`}
        alt={name ?? id}
        className={`${className} shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-slate-200 dark:ring-white/10`}
        onError={() => (icon ? setIcon(null) : setMissing(true))}
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
