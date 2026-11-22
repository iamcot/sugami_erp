'use client';

import { useState } from 'react';
import { CategoryBrand, Field, inputCls, useMeta } from '@/components/product-form-parts';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/api';

interface EditableProduct {
  code: string;
  name: string;
  status: 'active' | 'draft' | 'archived';
  category: { id?: string; name: string } | null;
  brand: { name: string } | null;
}
export interface EditableVariant {
  sku: string;
  barcode: string | null;
  price: number;
  minStock: number;
  status: string;
  optionValues: string[];
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Product-level fields: name, status, category, brand. */
export function ProductEditPanel({
  product,
  onSaved,
  onClose,
}: {
  product: EditableProduct;
  onSaved: () => void;
  onClose: () => void;
}) {
  const meta = useMeta();
  const [name, setName] = useState(product.name);
  const [status, setStatus] = useState(product.status);
  const [categoryId, setCategoryId] = useState(product.category?.id ?? '');
  const [brand, setBrand] = useState(product.brand?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/products/${encodeURIComponent(product.code)}`, {
        method: 'PATCH',
        json: { name, status, categoryId: categoryId || null, brand: brand.trim() || null },
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 grid gap-3 p-4 md:grid-cols-2">
      <Field label="Tên sản phẩm">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Trạng thái">
        <select
          className={inputCls}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="active">Đang bán</option>
          <option value="draft">Nháp</option>
          <option value="archived">Lưu trữ</option>
        </select>
      </Field>
      <CategoryBrand
        meta={meta}
        categoryId={categoryId}
        brand={brand}
        onCategory={setCategoryId}
        onBrand={setBrand}
      />
      <div className="flex items-center gap-3 md:col-span-2">
        <Button disabled={busy || !name.trim()} onClick={() => void save()}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Hủy
        </Button>
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
    </Card>
  );
}

/** One variant row turned into inputs: price, barcode, minimum stock, active/inactive. */
export function VariantEditRow({
  variant,
  colSpan,
  onSaved,
  onClose,
}: {
  variant: EditableVariant;
  colSpan: number;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(String(variant.price));
  const [barcode, setBarcode] = useState(variant.barcode ?? '');
  const [minStock, setMinStock] = useState(String(variant.minStock));
  const [active, setActive] = useState(variant.status !== 'inactive');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/variants/${encodeURIComponent(variant.sku)}`, {
        method: 'PATCH',
        json: {
          price: Number(price) || 0,
          barcode: barcode.trim() || null,
          minStock: Number(minStock) || 0,
          status: active ? 'active' : 'inactive',
        },
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <tr className="bg-slate-50 dark:bg-slate-900">
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <span className="w-full text-xs text-slate-500">
            {variant.optionValues.join(' / ') || 'Mặc định'} · {variant.sku}
          </span>
          <Field label="Giá bán">
            <input
              className={`${inputCls} w-32 text-right`}
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(digits(e.target.value))}
            />
          </Field>
          <Field label="Mã vạch">
            <input
              className={`${inputCls} w-44 font-mono`}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </Field>
          <Field label="Tồn tối thiểu">
            <input
              className={`${inputCls} w-28 text-right`}
              inputMode="numeric"
              value={minStock}
              onChange={(e) => setMinStock(digits(e.target.value))}
            />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Đang bán
          </label>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </td>
    </tr>
  );
}

/** Add another variant (new option values extend the product's options). */
export function AddVariantForm({
  code,
  options,
  onSaved,
}: {
  code: string;
  options: string[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<string[]>(options.map(() => ''));
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
        <button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setOpen(true)}>
          + Thêm biến thể
        </button>
      </div>
    );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/products/${encodeURIComponent(code)}/variants`, {
        method: 'POST',
        json: { optionValues: values.map((v) => v.trim()), price: Number(price) || 0 },
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
      {options.map((name, i) => (
        <Field key={name} label={name}>
          <input
            className={`${inputCls} w-36`}
            value={values[i]}
            onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
        </Field>
      ))}
      <Field label="Giá bán">
        <input
          className={`${inputCls} w-32 text-right`}
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(digits(e.target.value))}
        />
      </Field>
      <Button disabled={busy || values.some((v) => !v.trim())} onClick={() => void save()}>
        {busy ? 'Đang lưu…' : 'Thêm'}
      </Button>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Hủy
      </Button>
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </div>
  );
}
