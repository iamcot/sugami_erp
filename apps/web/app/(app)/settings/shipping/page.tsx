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
  ahamoveServices: string[];
  carriers: Record<string, { enabled: boolean; pickupTimes: string[] }>;
}
interface Partner {
  id: string;
  name: string;
}
interface AhaService {
  id: string;
  name: string;
}
interface Status {
  ahamove: boolean;
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
  const [aha, setAha] = useState<AhaService[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  /** Pickup times as typed ("10:00, 16:00"), turned into the list on save. */
  const [timesText, setTimesText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Settings>('/shipping/settings')
      .then((v) => {
        setS(v);
        setTimesText(
          Object.fromEntries(Object.entries(v.carriers ?? {}).map(([k, c]) => [k, c.pickupTimes.join(', ')])),
        );
      })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }));
    api<{ data: Partner[] }>('/shipping/partners')
      .then((r) => setPartners(r.data))
      .catch(() => undefined);
    api<{ data: AhaService[] }>('/shipping/ahamove-services')
      .then((r) => setAha(r.data))
      .catch(() => undefined);
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
      const carriers = Object.fromEntries(
        Object.entries(s.carriers).map(([k, c]) => [
          k,
          {
            enabled: c.enabled,
            pickupTimes: (timesText[k] ?? '')
              .split(/[,;\s]+/)
              .map((t) => t.trim())
              .filter(Boolean),
          },
        ]),
      );
      setS(await api<Settings>('/shipping/settings', { method: 'PUT', json: { ...s, carriers } }));
      setMsg({ ok: true, text: 'Đã lưu' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Vận chuyển"
        description="Điểm lấy hàng, cỡ hộp, hãng giao thường và dịch vụ AhaMove"
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
        <Badge tone={st?.ahamove ? 'success' : 'neutral'}>
          {st?.ahamove ? 'AhaMove đã cấu hình' : 'AhaMove chưa cấu hình'}
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

      {partners.length > 0 && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 font-semibold">Hãng giao thường shop dùng</h2>
          <p className="mb-3 text-xs text-slate-500">
            Tick các hãng quen: bảng giá Giao thường chỉ hiện các hãng này (không tick hãng nào = hiện hết).
            Mốc lấy hàng theo thỏa thuận với từng hãng (giờ Việt Nam, cách nhau dấu phẩy, ví dụ 10:00, 16:00):
            đơn sẽ có hạn đóng hàng là mốc lấy sắp tới.
          </p>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {partners.map((p) => {
              const c = s.carriers[p.id] ?? { enabled: false, pickupTimes: [] };
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                  <label className="flex w-48 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) =>
                        setS({
                          ...s,
                          carriers: { ...s.carriers, [p.id]: { ...c, enabled: e.target.checked } },
                        })
                      }
                    />
                    {p.name}
                  </label>
                  <input
                    className={`${input} max-w-xs`}
                    placeholder="Mốc lấy hàng, ví dụ 10:00, 16:00"
                    value={timesText[p.id] ?? ''}
                    onChange={(e) => setTimesText({ ...timesText, [p.id]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {st?.ahamove && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 font-semibold">Dịch vụ AhaMove hiện trong bảng giá</h2>
          <p className="mb-3 text-xs text-slate-500">
            Danh sách lấy từ AhaMove theo thành phố của shop. Không tick dịch vụ nào = hiện tất cả.
          </p>
          {aha.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa lấy được danh sách dịch vụ.</p>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {aha.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.ahamoveServices.includes(a.id)}
                    onChange={(e) =>
                      setS({
                        ...s,
                        ahamoveServices: e.target.checked
                          ? [...s.ahamoveServices, a.id]
                          : s.ahamoveServices.filter((x) => x !== a.id),
                      })
                    }
                  />
                  {a.name} <span className="font-mono text-xs text-slate-400">{a.id}</span>
                </label>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </Button>
        {msg && (
          <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
