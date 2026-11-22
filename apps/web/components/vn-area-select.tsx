'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Units {
  provinces: [string, string][];
  wards: Record<string, string[]>;
}

let cache: Promise<Units> | null = null;
/** Vietnam's provinces and wards after the 2025 merger (34 provinces, 2 levels), loaded once. */
function loadUnits(): Promise<Units> {
  cache ??= fetch('/data/vn-units.json').then((r) => r.json() as Promise<Units>);
  return cache;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
const bare = (s: string) => fold(s).replace(/^(thanh pho|tinh|phuong|xa|dac khu|thi tran)\s+/, '');

/** The province a stored value stands for; old KiotViet values look like "Hà Nội - Quận Cầu Giấy". */
export function findProvince(units: Units, value: string): [string, string] | undefined {
  if (!value) return undefined;
  const v = bare(value);
  return (
    units.provinces.find(([, n]) => bare(n) === v) ?? units.provinces.find(([, n]) => v.startsWith(bare(n)))
  );
}

const input =
  'w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-brand-600 dark:border-slate-700';

function Combo({
  value,
  options,
  placeholder,
  disabled,
  onPick,
}: {
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const shown = useMemo(() => {
    const k = fold(q);
    return (k ? options.filter((o) => fold(o).includes(k)) : options).slice(0, 80);
  }, [options, q]);
  useEffect(() => setHi(0), [q, open]);
  const choose = (o: string) => {
    onPick(o);
    setOpen(false);
    // keep the keyboard flow: focus returns to the field so Tab moves on
    setTimeout(() => trigger.current?.focus(), 0);
  };
  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        onClick={() => {
          setQ('');
          setOpen((o) => !o);
        }}
        className={`${input} flex items-center justify-between text-left disabled:opacity-50`}
      >
        <span className={value ? '' : 'text-slate-400'}>{value || placeholder}</span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-[60] mt-1 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, shown.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (shown[hi]) choose(shown[hi]);
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
            placeholder="Gõ để tìm…"
            className="w-full border-b border-slate-200 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-700"
          />
          <ul className="max-h-56 overflow-auto text-sm">
            {shown.length === 0 && <li className="px-3 py-2 text-slate-500">Không có kết quả</li>}
            {shown.map((o, i) => (
              <li
                key={o}
                ref={(el) => {
                  if (el && i === hi) el.scrollIntoView({ block: 'nearest' });
                }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className={`w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${i === hi ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => choose(o)}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Province/city and ward pickers with search; the ward list follows the chosen province. */
export function AreaSelect({
  province,
  ward,
  onChange,
}: {
  province: string;
  ward: string;
  onChange: (v: { province: string; ward: string }) => void;
}) {
  const [units, setUnits] = useState<Units | null>(null);
  useEffect(() => {
    loadUnits().then(setUnits, () => undefined);
  }, []);
  const code = units ? findProvince(units, province)?.[0] : undefined;
  return (
    <div className="grid grid-cols-2 gap-x-6">
      <label className="text-xs text-slate-500">
        Tỉnh/Thành phố
        <Combo
          value={province}
          options={units?.provinces.map(([, n]) => n) ?? []}
          placeholder="Chọn Tỉnh/TP"
          onPick={(p) => onChange({ province: p, ward: '' })}
        />
      </label>
      <label className="text-xs text-slate-500">
        Phường/Xã
        <Combo
          value={ward}
          options={code ? (units?.wards[code] ?? []) : []}
          placeholder={code ? 'Chọn Phường/Xã' : 'Chọn Tỉnh/TP trước'}
          disabled={!code}
          onPick={(w) => onChange({ province, ward: w })}
        />
      </label>
    </div>
  );
}
