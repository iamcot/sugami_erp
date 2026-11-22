'use client';

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Button, Card, PageHeader } from '../../../../components/ui';
import { ApiError } from '../../../../lib/api';

interface Issue {
  row: number;
  sku?: string;
  level: 'error' | 'warning';
  message: string;
}
interface Counts {
  created: number;
  updated: number;
  unchanged: number;
}
interface ProductSummary {
  kind: 'products';
  file: string;
  dryRun: boolean;
  rows: number;
  categories: { created: number };
  products: Counts;
  variants: Counts;
  openingStock: { skus: number; units: number };
  stockDiffs: { sku: string; sugami: number; kiotviet: number }[];
  issues: Issue[];
}
interface InvoiceSummary {
  kind: 'invoices';
  file: string;
  dryRun: boolean;
  rows: number;
  orders: Counts;
  byChannel: Record<string, { orders: number; revenue: number }>;
  revenue: number;
  stock: { applied: number; beforeSnapshot: number; reversed: number };
  unknownSkus: string[];
  issues: Issue[];
}
type Summary = ProductSummary | InvoiceSummary;
type Kind = Summary['kind'];

const KINDS: Record<Kind, { label: string; hint: string; file: string }> = {
  products: {
    label: 'Hàng hóa + tồn',
    hint: 'Hàng hóa → Xuất file. Tạo sản phẩm, mã hàng, tồn đầu kỳ.',
    file: 'DanhSachSanPham_KV….xlsx',
  },
  invoices: {
    label: 'Hóa đơn',
    hint: 'Hóa đơn → Xuất file chi tiết. Tạo đơn hàng, trừ tồn cho đơn sau lần nhập tồn đầu kỳ.',
    file: 'DanhSachChiTietHoaDon_KV….xlsx',
  },
};
const CHANNEL_LABEL: Record<string, string> = { shopee: 'Shopee', tiktok: 'TikTok Shop', store: 'Bán trực tiếp' };

async function send(kind: Kind, file: File, dryRun: boolean): Promise<Summary> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/imports/kiotviet/${kind}?dryRun=${dryRun}`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  const body = (await res.json().catch(() => ({}))) as Summary & { message?: string; issues?: Issue[] };
  if (!res.ok) throw Object.assign(new ApiError(body.message ?? `Lỗi ${res.status}`, res.status), { issues: body.issues });
  return { ...body, kind } as Summary;
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function ImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('products');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [done, setDone] = useState<Summary | null>(null);
  const [error, setError] = useState<{ message: string; issues?: Issue[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (f: File, dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const s = await send(kind, f, dryRun);
      if (dryRun) setPreview(s);
      else {
        setDone(s);
        setPreview(null);
      }
    } catch (e) {
      const err = e as ApiError & { issues?: Issue[] };
      setError({ message: err.message, issues: err.issues });
    } finally {
      setBusy(false);
    }
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setDone(null);
    setPreview(null);
    void run(f, true);
  };

  const shown = done ?? preview;
  const errors = shown?.issues.filter((i) => i.level === 'error') ?? error?.issues ?? [];
  const warnings = shown?.issues.filter((i) => i.level === 'warning') ?? [];

  return (
    <>
      <PageHeader
        title="Nhập dữ liệu từ KiotViet"
        description="Chạy lại cùng file nhiều lần không bị nhân đôi. Luôn xem trước rồi mới nhập."
      />

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setFile(null);
              setPreview(null);
              setDone(null);
              setError(null);
            }}
            className={
              k === kind
                ? 'rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }
          >
            {KINDS[k].label}
          </button>
        ))}
      </div>

      <Card
        className="flex cursor-pointer flex-col items-center gap-3 border-dashed p-8 text-center"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        <FileSpreadsheet className="size-8 text-brand-600" />
        <div className="font-medium">{file ? file.name : `Kéo thả hoặc bấm để chọn file ${KINDS[kind].file}`}</div>
        <div className="text-sm text-slate-500">{KINDS[kind].hint}</div>
        <div className="text-xs text-slate-400">Sugami đọc thử và cho xem trước, chưa ghi gì cho tới khi bạn bấm Nhập.</div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </Card>

      {busy && <p className="mt-4 text-sm text-slate-500">Đang xử lý…</p>}

      {error && (
        <Card className="mt-4 flex gap-3 border-rose-200 p-4 text-rose-700 dark:border-rose-900 dark:text-rose-300">
          <XCircle className="size-5 shrink-0" />
          <div>{error.message}</div>
        </Card>
      )}

      {shown && (
        <Card className="mt-4 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {done ? (
              <>
                <CheckCircle2 className="size-5 text-emerald-600" />
                <span className="font-medium">Đã nhập xong {fmt(done.rows)} dòng</span>
              </>
            ) : (
              <span className="font-medium">Xem trước: {fmt(shown.rows)} dòng</span>
            )}
            {errors.length > 0 && <Badge tone="danger">{errors.length} lỗi</Badge>}
            {warnings.length > 0 && <Badge tone="warn">{warnings.length} cảnh báo</Badge>}
          </div>
          {shown.kind === 'products' ? <ProductStats s={shown} /> : <InvoiceStats s={shown} />}

          {!done && (
            <div className="mt-4 flex gap-2">
              <Button disabled={busy || errors.length > 0 || !file} onClick={() => file && run(file, false)}>
                <Upload className="size-4" /> Nhập vào Sugami
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
                Chọn file khác
              </Button>
            </div>
          )}
        </Card>
      )}

      {(errors.length > 0 || warnings.length > 0) && (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-800">
            {errors.length > 0 ? 'Sửa các lỗi trên KiotViet rồi xuất file lại' : 'Cảnh báo (vẫn nhập được)'}
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2">Dòng</th>
                  <th className="px-4 py-2">Mã hàng</th>
                  <th className="px-4 py-2">Vấn đề</th>
                </tr>
              </thead>
              <tbody>
                {[...errors, ...warnings].map((i, k) => (
                  <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-1.5 tabular-nums text-slate-500">{i.row}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">{i.sku ?? '–'}</td>
                    <td className="px-4 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        {i.level === 'error' ? (
                          <XCircle className="size-4 text-rose-600" />
                        ) : (
                          <AlertTriangle className="size-4 text-amber-500" />
                        )}
                        {i.message}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function ProductStats({ s }: { s: ProductSummary }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Sản phẩm"
          value={`${fmt(s.products.created)} mới`}
          hint={`${fmt(s.products.updated)} cập nhật · ${fmt(s.products.unchanged)} giữ nguyên`}
        />
        <Stat
          label="Mã hàng (SKU)"
          value={`${fmt(s.variants.created)} mới`}
          hint={`${fmt(s.variants.updated)} cập nhật · ${fmt(s.variants.unchanged)} giữ nguyên`}
        />
        <Stat label="Tồn đầu kỳ" value={`${fmt(s.openingStock.units)} cái`} hint={`${fmt(s.openingStock.skus)} mã`} />
        <Stat label="Nhóm hàng mới" value={fmt(s.categories.created)} />
      </div>
      {s.stockDiffs.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          {fmt(s.stockDiffs.length)} mã có tồn Sugami khác KiotViet. Sugami giữ nguyên số của mình (đối chiếu chênh
          lệch sẽ có ở màn hình riêng).
        </div>
      )}
    </>
  );
}

function InvoiceStats({ s }: { s: InvoiceSummary }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Đơn hàng"
          value={`${fmt(s.orders.created)} mới`}
          hint={`${fmt(s.orders.updated)} cập nhật · ${fmt(s.orders.unchanged)} giữ nguyên`}
        />
        <Stat label="Doanh thu (không tính đơn hủy)" value={`${fmt(s.revenue)} đ`} />
        <Stat
          label="Trừ tồn"
          value={`${fmt(s.stock.applied)} dòng`}
          hint={`${fmt(s.stock.beforeSnapshot)} dòng trước lần nhập tồn, không trừ lại${s.stock.reversed ? ` · ${fmt(s.stock.reversed)} hoàn do hủy` : ''}`}
        />
        <Stat label="Mã hàng chưa có" value={fmt(s.unknownSkus.length)} hint={s.unknownSkus.length ? 'Không trừ tồn' : undefined} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {Object.entries(s.byChannel).map(([ch, v]) => (
          <Badge key={ch} tone="brand">
            {CHANNEL_LABEL[ch] ?? ch}: {fmt(v.orders)} đơn · {fmt(v.revenue)} đ
          </Badge>
        ))}
      </div>
    </>
  );
}
