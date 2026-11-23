import type { PrismaClient } from '@sugami/db';
import { describe, expect, it, vi } from 'vitest';
import { applyAhamoveStatus, dropoffOf, pickupFromEnv } from './ahamove.js';

const order = (over: Record<string, unknown> = {}) =>
  ({
    code: 'BH000007',
    shipAddress: '12 Lê Lợi, Bến Nghé, Hồ Chí Minh',
    shipPhone: '0912345678',
    internalNote: 'Người nhận: Lan\nGọi trước',
    codAmount: 250000n,
    customer: { name: 'Khách cũ' },
    ...over,
  }) as unknown as Parameters<typeof dropoffOf>[0];

describe('dropoffOf', () => {
  it('uses the receiver name from the note, adds the country and COD', () => {
    expect(dropoffOf(order())).toEqual({
      address: '12 Lê Lợi, Bến Nghé, Hồ Chí Minh, Việt Nam',
      name: 'Lan',
      mobile: '0912345678',
      tracking_number: 'BH000007',
      cod: 250000,
    });
  });
  it('falls back to the customer name and omits COD when zero', () => {
    const d = dropoffOf(order({ internalNote: null, codAmount: 0n }));
    expect(d.name).toBe('Khách cũ');
    expect(d).not.toHaveProperty('cod');
  });
  it('refuses an order without phone or address', () => {
    expect(() => dropoffOf(order({ shipPhone: null }))).toThrow(/thiếu/);
  });
});

describe('pickupFromEnv', () => {
  it('needs name, phone and address', () => {
    expect(pickupFromEnv({ AHAMOVE_PICKUP_NAME: 'Shop' } as NodeJS.ProcessEnv)).toBeNull();
    expect(
      pickupFromEnv({
        AHAMOVE_PICKUP_NAME: 'Shop',
        AHAMOVE_PICKUP_PHONE: '09',
        AHAMOVE_PICKUP_ADDRESS: 'A',
        AHAMOVE_PICKUP_LAT: '10.7',
        AHAMOVE_PICKUP_LNG: '106.6',
      } as NodeJS.ProcessEnv),
    ).toEqual({ name: 'Shop', mobile: '09', address: 'A', lat: 10.7, lng: 106.6 });
  });
});

describe('applyAhamoveStatus', () => {
  const fakeDb = (o: Record<string, unknown> | null) => {
    const update = vi.fn(async () => ({}));
    const db = {
      order: {
        findFirst: vi.fn(async () => o),
        findUnique: vi.fn(async () => null),
        update,
      },
    } as unknown as PrismaClient;
    return { db, update };
  };
  const shipped = { id: 'o1', code: 'BH000007', status: 'shipped', shippingStatus: 'x', trackingUrl: null };

  it('ignores trips of other orders', async () => {
    const { db } = fakeDb(null);
    expect(await applyAhamoveStatus(db, 'ZZ', { status: 'COMPLETED' })).toEqual({ matched: false });
  });
  it('records the driver stage and the tracking link', async () => {
    const { db, update } = fakeDb(shipped);
    await applyAhamoveStatus(db, 'AB', { status: 'ACCEPTED', shared_link: 'https://t/x' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { shippingStatus: 'Ahamove: tài xế đang đến lấy hàng', trackingUrl: 'https://t/x' },
    });
  });
  it('flags a cancelled trip for the seller instead of changing the order', async () => {
    const { db, update } = fakeDb(shipped);
    await applyAhamoveStatus(db, 'AB', { status: 'CANCELLED', cancel_comment: 'Không có tài xế' });
    const data = (update.mock.calls[0] as unknown as [{ data: { shippingStatus: string } }])[0].data;
    expect(data.shippingStatus).toMatch(/đã hủy.*Không có tài xế/);
  });
});
