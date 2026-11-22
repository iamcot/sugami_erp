'use client';

import { ArrowDown, ArrowUp, Plus, Printer, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { type Block, printReceipt, receiptHtml, type ReceiptTemplate, SAMPLE_ORDER } from '@/lib/receipt';

const BLOCK_LABEL: Record<Block['type'], string> = {
  text: 'Dòng chữ',
  order_info: 'Thông tin đơn (số HĐ, ngày, khách)',
  lines: 'Chi tiết đơn hàng',
  totals: 'Tổng tiền, giảm giá, thanh toán',
  divider: 'Đường kẻ',
};
const field =
  'rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700';

export default function ReceiptTemplatesPage() {
  const [list, setList] = useState<ReceiptTemplate[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptTemplate | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (keep?: string) => {
    const r = await api<{ data: ReceiptTemplate[] }>('/receipt-templates');
    setList(r.data);
    const pick = r.data.find((t) => t.id === (keep ?? sel)) ?? r.data[0];
    setSel(pick?.id ?? null);
    setDraft(pick ? structuredClone(pick) : null);
  }, [sel]);
  useEffect(() => {
    load().catch((e: Error) => setMsg(e.message));
  }, []);

  const set = (patch: Partial<ReceiptTemplate>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setBlock = (i: number, b: Block) => set({ blocks: draft!.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, d: -1 | 1) => {
    const bs = [...draft!.blocks];
    const j = i + d;
    if (j < 0 || j >= bs.length) return;
    [bs[i], bs[j]] = [bs[j]!, bs[i]!];
    set({ blocks: bs });
  };
  const add = (type: Block['type']) =>
    set({
      blocks: [
        ...draft!.blocks,
        type === 'text' ? { type, text: '', align: 'center', bold: false, size: 'md' } : ({ type } as Block),
      ],
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      const body = { name: draft!.name, paperWidth: draft!.paperWidth, blocks: draft!.blocks, isDefault: draft!.isDefault };
      const r = await api<ReceiptTemplate>(`/receipt-templates/${draft!.id}`, { method: 'PUT', json: body });
      setMsg('Đã lưu');
      await load(r.id);
    });
  const create = () =>
    run(async () => {
      const r = await api<ReceiptTemplate>('/receipt-templates', {
        method: 'POST',
        json: { name: 'Mẫu mới', paperWidth: 80, blocks: draft?.blocks ?? [], isDefault: false },
      });
      await load(r.id);
    });
  const remove = () =>
    run(async () => {
      if (!draft || list.length < 2) return setMsg('Phải còn ít nhất một mẫu');
      await api(`/receipt-templates/${draft.id}`, { method: 'DELETE' });
      await load(list.find((t) => t.id !== draft.id)?.id);
    });

  return (
    <>
      <PageHeader title="Mẫu biên lai" description="Bill in bằng máy in nhiệt khi lưu đơn bán hàng" />
      {msg && <p className="mb-3 text-sm text-slate-600">{msg}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {list.map((t) => (
          <Button
            key={t.id}
            variant={t.id === sel ? 'primary' : 'secondary'}
            onClick={() => {
              setSel(t.id);
              setDraft(structuredClone(t));
            }}
          >
            {t.isDefault && <Star className="size-3.5" />} {t.name}
          </Button>
        ))}
        <Button variant="ghost" disabled={busy} onClick={create}>
          <Plus className="size-4" /> Thêm mẫu
        </Button>
      </div>
      {draft && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${field} w-56`} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              <select
                className={field}
                value={draft.paperWidth}
                onChange={(e) => set({ paperWidth: Number(e.target.value) as 58 | 80 })}
              >
                <option value={80}>Khổ 80mm</option>
                <option value={58}>Khổ 58mm</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={draft.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
                Mẫu mặc định
              </label>
            </div>
            <ul className="space-y-2">
              {draft.blocks.map((b, i) => (
                <li key={`${b.type}-${i}`} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{BLOCK_LABEL[b.type]}</span>
                    <span className="flex gap-1">
                      <button aria-label="Lên" onClick={() => move(i, -1)}>
                        <ArrowUp className="size-4" />
                      </button>
                      <button aria-label="Xuống" onClick={() => move(i, 1)}>
                        <ArrowDown className="size-4" />
                      </button>
                      <button aria-label="Xóa" onClick={() => set({ blocks: draft.blocks.filter((_, j) => j !== i) })}>
                        <Trash2 className="size-4 text-rose-500" />
                      </button>
                    </span>
                  </div>
                  {b.type === 'text' && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        className={`${field} w-full`}
                        rows={2}
                        value={b.text}
                        onChange={(e) => setBlock(i, { ...b, text: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-3 text-sm">
                        <select className={field} value={b.align} onChange={(e) => setBlock(i, { ...b, align: e.target.value as typeof b.align })}>
                          <option value="left">Trái</option>
                          <option value="center">Giữa</option>
                          <option value="right">Phải</option>
                        </select>
                        <select className={field} value={b.size} onChange={(e) => setBlock(i, { ...b, size: e.target.value as typeof b.size })}>
                          <option value="sm">Nhỏ</option>
                          <option value="md">Vừa</option>
                          <option value="lg">Lớn</option>
                        </select>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={b.bold} onChange={(e) => setBlock(i, { ...b, bold: e.target.checked })} />
                          Đậm
                        </label>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(BLOCK_LABEL) as Block['type'][]).map((t) => (
                <Button key={t} variant="secondary" onClick={() => add(t)}>
                  <Plus className="size-3.5" /> {BLOCK_LABEL[t]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Trong dòng chữ có thể dùng {'{{code}}'} (số hóa đơn), {'{{date}}'}, {'{{customer}}'}, {'{{total}}'}.
            </p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={save}>
                Lưu mẫu
              </Button>
              <Button variant="secondary" onClick={() => printReceipt(draft, { ...SAMPLE_ORDER, orderedAt: new Date().toISOString() })}>
                <Printer className="size-4" /> In thử
              </Button>
              <Button variant="ghost" disabled={busy || list.length < 2} onClick={remove}>
                Xóa mẫu
              </Button>
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-medium">Xem trước</h2>
            <iframe
              title="Xem trước biên lai"
              className="h-[560px] w-full rounded-md border border-slate-200 bg-white dark:border-slate-700"
              srcDoc={receiptHtml(draft, SAMPLE_ORDER)}
            />
          </Card>
        </div>
      )}
    </>
  );
}
