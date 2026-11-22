'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface Meta {
  categories: { id: string; name: string }[];
  brands: string[];
  nextCode: string;
}

export const inputCls =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    api<Meta>('/catalog/meta').then(setMeta, () => {});
  }, []);
  return meta;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/** Category + brand pickers shared by the create page and the edit panel. */
export function CategoryBrand({
  meta,
  categoryId,
  brand,
  onCategory,
  onBrand,
}: {
  meta: Meta | null;
  categoryId: string;
  brand: string;
  onCategory: (v: string) => void;
  onBrand: (v: string) => void;
}) {
  return (
    <>
      <Field label="Nhóm hàng">
        <select className={inputCls} value={categoryId} onChange={(e) => onCategory(e.target.value)}>
          <option value="">(chưa có nhóm)</option>
          {meta?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Thương hiệu" hint="Gõ tên mới nếu chưa có trong danh sách">
        <input
          className={inputCls}
          list="brand-list"
          value={brand}
          onChange={(e) => onBrand(e.target.value)}
        />
        <datalist id="brand-list">
          {meta?.brands.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </Field>
    </>
  );
}
