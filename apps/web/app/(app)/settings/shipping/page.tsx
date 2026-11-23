'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface Box {
  key: string;
  label: string;
  maxGrams: number | null;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}
interface Settings {
  pickup: { name: string; phone: string; address: string; ward: string; province: string };
  boxes: Box[];
  defaultItemGrams: number;
  defaultPayee: 'receiver' | 'sender';
  preferredStandard: string;
}
interface Status {
  configured: boolean;
  mode: 'test' | 'live' | null;
  webhookConfigured: boolean;
}

const input =
  'w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-brand-600 dark:border-slate-700';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}

/** Settings → Vận chuyển: pickup point, box sizes and defaults for waybills created through Allingo. */
export default function ShippingSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Settings>('/shipping/settings')
      .then(setS)
      .catch((e: Error) => setMsg({ ok: false, text: e.message }));
    api<Status>('/shipping/status')
      .then(setSt)
      .catch(() => undefined);
  }, []);

  if (!s) return <p className="text-sm text-slate-500">{msg?.text ?? 'Đang tải…'}</p>;
  const setPickup = (k: keyof Settings['pickup'], v: string) =>
    setS({ ...s, pickup: { ...s.pickup, [k]: v } });
  const setBox = (i: number, patch: Partial<Box>) =>
    setS({ ...s, boxes: s.boxes.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      setS(await api<Settings>('/shipping/settings', { method: 'PUT', json: s }));
      setMsg({ ok: true, text: 'Đã lưu' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Vận chuyển"
        description="Điểm lấy hàng, cỡ hộp và mặc định khi tạo vận đơn qua Allingo"
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="font-medium">Kết nối Allingo</span>
        {st?.configured ? (
          <Badge tone={st.mode === 'live' ? 'success' : 'warn'}>
            {st.mode === 'live' ? 'CHẠY THẬT' : 'KHÓA THỬ'}
          </Badge>
        ) : (
          <Badge tone="danger">CHƯA CẤU HÌNH</Badge>
        )}
        <Badge tone={st?.webhookConfigured ? 'success' : 'neutral'}>
          {st?.webhookConfigured ? 'Webhook đã bật' : 'Webhook chưa bật (vẫn quét mỗi 15 phút)'}
        </Badge>
        <span className="text-slate-500">Khóa nằm trong .env trên máy chạy, xem docs/allingo.md.</span>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-semibold">Điểm lấy hàng (kho chính)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên người liên hệ">
            <input
              className={input}
              value={s.pickup.name}
              onChange={(e) => setPickup('name', e.target.value)}
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              className={input}
              value={s.pickup.phone}
              onChange={(e) => setPickup('phone', e.target.value)}
            />
          </Field>
          <Field label="Địa chỉ (số nhà, đường)">
            <input
              className={input}
              value={s.pickup.address}
              onChange={(e) => setPickup('address', e.target.value)}
            />
          </Field>
          <Field label="Phường/Xã">
            <input
              className={input}
              value={s.pickup.ward}
              onChange={(e) => setPickup('ward', e.target.value)}
            />
          </Field>
          <Field label="Tỉnh/Thành phố">
            <input
              className={input}
              value={s.pickup.province}
              onChange={(e) => setPickup('province', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="mb-1 font-semibold">Cỡ hộp</h2>
        <p className="mb-3 text-xs text-slate-500">
          Sugami chọn hộp nhỏ nhất chứa vừa tổng cân nặng của đơn. Allingo cần dài × rộng × cao (cm). Hộp cuối
          cùng để trống giới hạn cân là hộp cho mọi đơn nặng hơn.
        </p>
        <div className="space-y-3">
          {s.boxes.map((b, i) => (
            <div key={b.key} className="grid gap-3 sm:grid-cols-6">
              <Field label="Tên">
                <input
                  className={input}
                  value={b.label}
                  onChange={(e) => setBox(i, { label: e.target.value })}
                />
              </Field>
              <Field label="Nặng tối đa (g)">
                <input
                  className={input}
                  inputMode="numeric"
                  placeholder="không giới hạn"
                  value={b.maxGrams ?? ''}
                  onChange={(e) =>
                    setBox(i, { maxGrams: e.target.value === '' ? null : num(e.target.value) || null })
                  }
                />
              </Field>
              <Field label="Dài (cm)">
                <input
                  className={input}
                  inputMode="numeric"
                  value={b.lengthCm}
                  onChange={(e) => setBox(i, { lengthCm: num(e.target.value) })}
                />
              </Field>
              <Field label="Rộng (cm)">
                <input
                  className={input}
                  inputMode="numeric"
                  value={b.widthCm}
                  onChange={(e) => setBox(i, { widthCm: num(e.target.value) })}
                />
              </Field>
              <Field label="Cao (cm)">
                <input
                  className={input}
                  inputMode="numeric"
                  value={b.heightCm}
                  onChange={(e) => setBox(i, { heightCm: num(e.target.value) })}
                />
              </Field>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-semibold">Mặc định</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ai trả phí cho hãng">
            <select
              className={input}
              value={s.defaultPayee}
              onChange={(e) => setS({ ...s, defaultPayee: e.target.value as 'receiver' | 'sender' })}
            >
              <option value="receiver">Khách trả</option>
              <option value="sender">Shop trả</option>
            </select>
          </Field>
          <Field label="Hãng chọn sẵn ở tab Giao thường (mã hãng)">
            <input
              className={input}
              value={s.preferredStandard}
              onChange={(e) => setS({ ...s, preferredStandard: e.target.value.toLowerCase() })}
            />
          </Field>
          <Field label="Cân nặng giả định khi sản phẩm chưa có (g)">
            <input
              className={input}
              inputMode="numeric"
              value={s.defaultItemGrams}
              onChange={(e) => setS({ ...s, defaultItemGrams: num(e.target.value) || 1 })}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </Button>
        {msg && (
          <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</span>
        )}
      </div>
    </>
  );
}
