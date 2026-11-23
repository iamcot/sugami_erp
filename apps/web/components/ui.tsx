import { cn } from '@sugami/ui';
import type { ComponentProps, ReactNode } from 'react';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('glass rounded-xl', className)} {...props} />;
}

type Tone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger';

const toneClass: Record<Tone, string> = {
  neutral:
    'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-500/10 dark:text-slate-300',
  brand: 'border-brand-500/60 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/50 dark:bg-emerald-400/10 dark:text-emerald-300 dark:shadow-[0_0_8px_rgba(52,211,153,0.2)]',
  warn: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-300 dark:shadow-[0_0_8px_rgba(251,191,36,0.2)]',
  danger:
    'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/50 dark:bg-rose-400/10 dark:text-rose-300 dark:shadow-[0_0_8px_rgba(251,113,133,0.2)]',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-px font-mono text-[11px] font-semibold tracking-wide',
        toneClass[tone],
      )}
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
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50',
        variant === 'primary' && 'btn-accent',
        variant === 'secondary' &&
          'border border-slate-300/80 border-t-white bg-gradient-to-b from-white to-white/60 text-slate-700 shadow-[0_1px_2px_rgba(40,60,110,0.1)] hover:to-white dark:border-slate-700 dark:border-t-white/25 dark:from-white/10 dark:to-white/[0.02] dark:text-slate-200',
        variant === 'ghost' &&
          'font-medium text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10',
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
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/** KPI tile: glass with HUD corner marks; the value is set in mono so digits line up. */
export function Kpi({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="glass kpi rounded-xl px-4 py-3.5">
      <p className="hud-label text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1.5 font-mono text-lg font-semibold tracking-tight text-slate-900 tabular-nums sm:text-[22px] dark:text-white dark:[text-shadow:0_0_14px_rgb(var(--accent-rgb)/0.45)]">
        {value}
      </p>
      {sub !== undefined && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

/** Status/view tabs above a list: one segmented glass strip, optional count after each label. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('glass flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg p-1', className)}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
            value === t.id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white'
              : 'text-slate-600 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-white/5',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 font-mono text-xs text-slate-400">{t.count.toLocaleString('vi-VN')}</span>
          )}
        </button>
      ))}
    </div>
  );
}
