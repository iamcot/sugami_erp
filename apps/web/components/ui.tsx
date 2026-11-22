import { cn } from '@sugami/ui';
import type { ComponentProps, ReactNode } from 'react';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
      {...props}
    />
  );
}

type Tone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-50',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', toneClass[tone])}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'secondary' &&
          'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
        variant === 'ghost' &&
          'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        className,
      )}
      {...props}
    />
  );
}

const syncLabel = { synced: 'Đã đồng bộ', pending: 'Đang chờ', error: 'Lỗi' } as const;
const syncColor = { synced: 'bg-emerald-500', pending: 'bg-amber-400', error: 'bg-rose-500' } as const;

export function SyncDot({ state, label }: { state: keyof typeof syncLabel; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"
      title={syncLabel[state]}
    >
      <span className={cn('size-2 rounded-full', syncColor[state])} />
      {label}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
