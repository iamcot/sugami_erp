'use client';

import { cn } from '@sugami/ui';
import { Check, ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Filter button with a drop-down list (Gmail style): shows "Name: chosen value" and lights up
 * when something other than the first option ("all") is picked.
 */
export function FilterMenu<V extends string>({
  label,
  value,
  options,
  onChange,
  footer,
}: {
  label: string;
  value: V;
  options: readonly (readonly [V, string])[];
  onChange: (v: V) => void;
  /** Extra content under the list, e.g. date inputs for a custom range. */
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const on = value !== options[0]?.[0];
  const current = options.find(([v]) => v === value)?.[1];
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[13px] font-medium',
          on
            ? 'border-brand-500/70 bg-brand-50 text-brand-700 shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.1)] dark:bg-brand-500/10 dark:text-brand-500'
            : 'border-slate-300/80 border-t-white bg-gradient-to-b from-white to-white/60 text-slate-700 shadow-[0_1px_2px_rgba(40,60,110,0.08)] dark:border-white/15 dark:from-white/10 dark:to-white/[0.02] dark:text-slate-200',
        )}
      >
        {on ? `${label}: ${current}` : label}
        <ChevronDown className="size-3.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-48 rounded-md border border-slate-300/70 bg-white/95 py-1 shadow-[0_16px_40px_rgba(60,80,140,0.22)] backdrop-blur-xl dark:border-white/15 dark:bg-[#0c1628]/95">
          {options.map(([v, l]) => (
            <button
              key={v}
              onClick={() => {
                onChange(v);
                if (!footer) setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-500/10',
                v === value && 'font-semibold text-brand-700 dark:text-brand-500',
              )}
            >
              <Check className={cn('size-3.5', v === value ? 'opacity-100' : 'opacity-0')} />
              {l}
            </button>
          ))}
          {footer && <div className="border-t border-slate-200 px-3 py-2 dark:border-white/10">{footer}</div>}
        </div>
      )}
    </div>
  );
}
