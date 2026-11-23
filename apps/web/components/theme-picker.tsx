'use client';

import { cn } from '@sugami/ui';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ACCENTS, applyTheme, DEFAULT_THEME, MODES, readTheme, type Theme } from '@/lib/theme';
import { Card } from './ui';

/** Cài đặt → Giao diện: accent colour and light/dark glass, saved on this device. */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  useEffect(() => setTheme(readTheme()), []);

  const pick = (t: Partial<Theme>) => {
    const next = { ...theme, ...t };
    setTheme(next);
    applyTheme(next);
  };

  return (
    <Card className="p-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Chọn màu nhấn và nền sáng/tối. Lưu riêng trên từng máy, mỗi người tự chọn được.
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="hud-label mb-2 text-slate-500">Màu nhấn</p>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => pick({ accent: a.id })}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  theme.accent === a.id
                    ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-500'
                    : 'border-slate-300/80 bg-white/60 hover:bg-white dark:border-white/15 dark:bg-white/5',
                )}
              >
                <span
                  className="size-4 rotate-45 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                  style={{ background: a.swatch }}
                />
                {a.label}
                {theme.accent === a.id && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="hud-label mb-2 text-slate-500">Nền</p>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => pick({ mode: m.id })}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  theme.mode === m.id
                    ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-500'
                    : 'border-slate-300/80 bg-white/60 hover:bg-white dark:border-white/15 dark:bg-white/5',
                )}
              >
                <span
                  className={cn(
                    'size-4 border',
                    m.id === 'light'
                      ? 'border-slate-300 bg-gradient-to-br from-sky-100 via-white to-pink-100'
                      : 'border-slate-600 bg-gradient-to-br from-slate-900 to-indigo-950',
                  )}
                />
                {m.label}
                {theme.mode === m.id && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
