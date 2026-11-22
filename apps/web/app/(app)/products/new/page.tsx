'use client';

import { buildSku, variantMatrix } from '@sugami/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CategoryBrand, Field, inputCls, useMeta } from '@/components/product-form-parts';
import { Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface Opt {
  name: string;
  /** Comma separated while typing. */
  values: string;
}

const split = (s: string) => [
  ...new Set(
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

export default function NewProductPage() {
  const router = useRouter();
  const meta = useMeta();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'active' | 'draft'>('active');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<Opt[]>([]);
  const [price, setPrice] = useState('');
  /** Per-variant overrides keyed by option values joined with "/" (price, barcode). */
  const [over, setOver] = useState<Record<string, { price?: string; barcode?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalCode = (code.trim() || meta?.nextCode || '').toUpperCase();
  const named = options.filter((o) => o.name.trim() && split(o.values).length);
  const combos = useMemo(
    () => (named.length ? variantMatrix(named.map((o) => split(o.values))) : [[]]),
    [JSON.stringify(named)],
  );
  const key = (c: string[]) => c.join('/');

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ code: string }>('/products', {
        method: 'POST',
        json: {
          code: code.trim() || undefined,
          name,
          status,
          description: description || null,
          categoryId: categoryId || null,
          brand: brand.trim() || null,
          options: named.map((o) => ({ name: o.name.trim(), values: split(o.values) })),
          variants: combos.map((c) => ({
            optionValues: c,
            price: Number(over[key(c)]?.price ?? price) || 0,
            barcode: over[key(c)]?.barcode?.trim() || null,
          })),
        },
      });
      router.push(`/products/${encodeURIComponent(res.code)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <Link
        href="/products"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Sản phẩm
      </Link>
      <PageHeader title="Thêm sản phẩm" description="Tồn kho và giá vốn sẽ có khi nhập hàng." />
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-2">
        <Field label="Tên sản phẩm">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Mã sản phẩm" hint="Để trống thì tự lấy số tiếp theo">
          <input
            className={`${inputCls} font-mono`}
            value={code}
            placeholder={meta?.nextCode}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <CategoryBrand
          meta={meta}
          categoryId={categoryId}
          brand={brand}
          onCategory={setCategoryId}
          onBrand={setBrand}
        />
        <Field label="Trạng thái">
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'draft')}
          >
            <option value="active">Đang bán</option>
            <option value="draft">Nháp</option>
          </select>
        </Field>
        <Field label="Giá bán chung (VND)" hint="Áp cho mọi biến thể, sửa riêng từng dòng ở dưới">
          <input
            className={inputCls}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Mô tả">
            <textarea
              className={inputCls}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Phân loại (màu, kích thước...)</h2>
          {options.length < 2 && (
            <Button variant="secondary" onClick={() => setOptions([...options, { name: '', values: '' }])}>
              Thêm thuộc tính
            </Button>
          )}
        </div>
        {options.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">Không thêm thì sản phẩm chỉ có một biến thể.</p>
        )}
        {options.map((o, i) => (
          <div key={i} className="mt-3 grid gap-3 md:grid-cols-[12rem_1fr_auto]">
            <Field label="Tên thuộc tính">
              <input
                className={inputCls}
                value={o.name}
                placeholder="Màu"
                onChange={(e) =>
                  setOptions(options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
            </Field>
            <Field label="Các giá trị, cách nhau bằng dấu phẩy">
              <input
                className={inputCls}
                value={o.values}
                placeholder="Đỏ, Xanh, Vàng"
                onChange={(e) =>
                  setOptions(options.map((x, j) => (j === i ? { ...x, values: e.target.value } : x)))
                }
              />
            </Field>
            <button
              className="self-end pb-2 text-sm text-slate-500 hover:text-rose-600"
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
            >
              Bỏ
            </button>
          </div>
        ))}
      </Card>

      <Card className="mb-4 overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-800">
          Biến thể ({combos.length})
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-2 font-medium">Biến thể</th>
              <th className="px-4 py-2 font-medium">Mã hàng</th>
              <th className="px-4 py-2 font-medium">Giá bán</th>
              <th className="px-4 py-2 font-medium">Mã vạch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {combos.map((c) => (
              <tr key={key(c)}>
                <td className="px-4 py-2">
                  {c.length ? c.join(' / ') : <span className="text-slate-400">Mặc định</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{finalCode ? buildSku(finalCode, c) : '…'}</td>
                <td className="px-4 py-2">
                  <input
                    className="w-32 rounded-md border border-slate-200 bg-white px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-900"
                    inputMode="numeric"
                    value={over[key(c)]?.price ?? price}
                    onChange={(e) =>
                      setOver({
                        ...over,
                        [key(c)]: { ...over[key(c)], price: e.target.value.replace(/\D/g, '') },
                      })
                    }
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className="w-40 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                    value={over[key(c)]?.barcode ?? ''}
                    onChange={(e) =>
                      setOver({ ...over, [key(c)]: { ...over[key(c)], barcode: e.target.value } })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={busy || !name.trim()}>
          {busy ? 'Đang lưu…' : 'Tạo sản phẩm'}
        </Button>
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
    </>
  );
}
