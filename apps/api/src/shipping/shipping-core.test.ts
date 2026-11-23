import { describe, expect, it } from 'vitest';
import { buildInquiry, groupOf, orderWeight, pickBox, toQuoteRows } from './shipping-core.js';
import { DEFAULT_SHIPPING } from './shipping-settings.js';

const q = (partner: string, price: number, minutes: number | null, available = true) => ({
  service_id: `${partner}-${price}`,
  service_name: `${partner} ${price}`,
  partner: { id: partner, name: partner.toUpperCase() },
  price,
  estimated_minutes: minutes,
  available,
});

describe('pickBox', () => {
  const boxes = DEFAULT_SHIPPING.boxes;
  it('picks by weight: small <= 500 g, medium <= 3 kg, large above', () => {
    expect(pickBox(300, boxes).key).toBe('small');
    expect(pickBox(500, boxes).key).toBe('small');
    expect(pickBox(501, boxes).key).toBe('medium');
    expect(pickBox(3000, boxes).key).toBe('medium');
    expect(pickBox(3001, boxes).key).toBe('large');
    expect(pickBox(90_000, boxes).key).toBe('large');
  });
});

describe('orderWeight', () => {
  it('sums known weights and assumes the default for the rest', () => {
    expect(
      orderWeight(
        [
          { qty: 2, weightGrams: 150 },
          { qty: 1, weightGrams: null },
        ],
        200,
      ),
    ).toEqual({
      grams: 500,
      unknown: 1,
    });
  });
});

describe('quote rows', () => {
  it('groups carriers and marks cheapest and fastest inside each group', () => {
    const rows = toQuoteRows([
      q('spx', 15000, 2880),
      q('ghn', 22000, 1440),
      q('ahamove', 20000, 360),
      q('grab', 15000, 60),
      q('lalamove', 40000, null, false),
    ]);
    expect(groupOf(q('spx', 1, 2880))).toBe('standard');
    expect(groupOf(q('grab', 1, null))).toBe('fast');
    const by = Object.fromEntries(rows.map((r) => [r.partnerId, r]));
    expect(by.spx!.cheapest).toBe(true);
    expect(by.ghn!.fastest).toBe(true);
    expect(by.grab!.cheapest).toBe(true);
    expect(by.grab!.fastest).toBe(true);
    expect(by.ahamove!.cheapest).toBe(false);
    // unavailable services sink to the bottom and carry a reason
    expect(rows.at(-1)!.partnerId).toBe('lalamove');
    expect(rows.at(-1)!.unavailableReason).toBeTruthy();
  });
});

describe('Ahamove rows next to Allingo rows', () => {
  it('lands in the fast group and takes part in the cheapest mark', () => {
    const rows = toQuoteRows([
      q('lalamove', 30000, 60),
      { ...q('ahamove', 20000, null), service_id: 'ahamove:SGN-BIKE' },
    ]);
    const aha = rows.find((r) => r.partnerId === 'ahamove')!;
    expect(aha.group).toBe('fast');
    expect(aha.cheapest).toBe(true);
    expect(aha.serviceId).toBe('ahamove:SGN-BIKE');
  });
});

describe('buildInquiry', () => {
  it('converts grams to kilograms and sets who pays and how', () => {
    const body = buildInquiry(
      { name: 'Sugami', phone: '0900', address: '1 A', ward: 'P1', province: 'Hà Nội' },
      { name: 'Khách', phone: '0911', address: '2 B', ward: null, province: 'Hồ Chí Minh' },
      {
        grams: 750,
        box: DEFAULT_SHIPPING.boxes[1]!,
        codAmount: 150000,
        payee: 'sender',
        declaredValue: 150000,
      },
    );
    expect(body.package).toMatchObject({
      weight: 0.75,
      length: 30,
      width: 25,
      height: 20,
      declared_value: 150000,
    });
    expect(body.cod_amount).toBe(150000);
    expect(body.delivery_payment_method).toBe('credit');
    expect(body.dropoff.ward).toBeUndefined();
    expect(body.pickup.province).toBe('Hà Nội');
  });
});
