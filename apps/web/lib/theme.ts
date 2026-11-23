/** Colour theme chosen in Cài đặt → Giao diện; stored per device and applied as attributes on <html>. */
export const ACCENTS = [
  { id: 'teal', label: 'Xanh ngọc', swatch: '#14b8a6' },
  { id: 'sky', label: 'Xanh da trời', swatch: '#3aa0f0' },
  { id: 'lilac', label: 'Tím pastel', swatch: '#9b7bea' },
] as const;
export const MODES = [
  { id: 'light', label: 'Kính sáng' },
  { id: 'dark', label: 'Kính tối' },
] as const;

export type Accent = (typeof ACCENTS)[number]['id'];
export type Mode = (typeof MODES)[number]['id'];

const KEY = 'sugami.theme';

export interface Theme {
  accent: Accent;
  mode: Mode;
}
export const DEFAULT_THEME: Theme = { accent: 'teal', mode: 'light' };

export function parseTheme(raw: string | null): Theme {
  try {
    const v = JSON.parse(raw ?? '{}') as Partial<Theme>;
    return {
      accent: ACCENTS.some((a) => a.id === v.accent) ? (v.accent as Accent) : DEFAULT_THEME.accent,
      mode: MODES.some((m) => m.id === v.mode) ? (v.mode as Mode) : DEFAULT_THEME.mode,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.accent = t.accent;
  document.documentElement.dataset.mode = t.mode;
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // private mode: the theme still applies for this visit
  }
}

/** Inline <head> script: same logic as readTheme/applyTheme, run before React loads. */
export const THEME_BOOT = `try{var t=JSON.parse(localStorage.getItem('${KEY}')||'{}');var d=document.documentElement;if(['teal','sky','lilac'].indexOf(t.accent)>-1)d.dataset.accent=t.accent;if(['light','dark'].indexOf(t.mode)>-1)d.dataset.mode=t.mode;}catch(e){}`;
