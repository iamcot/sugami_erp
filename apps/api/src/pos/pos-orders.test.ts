import { describe, expect, it } from 'vitest';
import { handoverDeadline, posTotals } from './pos-orders.js';
import { PosPayload } from './pos-schema.js';

const payload = (p: Partial<PosPayload>) =>
  PosPayload.parse({
    lines: [
      { variantId: 'v1', qty: 2, price: 100000 },
      { variantId: 'v2', qty: 1, price: 50000 },
    ],
    ...p,
  });

describe('posTotals', () => {
  it('subtracts the discount and adds other charges', () => {
    const t = posTotals(payload({ discount: 20000, otherIncome: 5000 }), 'retail');
    expect(t).toMatchObject({ subtotal: 250000, total: 235000 });
  });
  it('never charges less than zero', () => {
    expect(posTotals(payload({ discount: 999999 }), 'retail').total).toBe(0);
  });
  it('collects the unpaid rest on delivery only when COD is on', () => {
    expect(posTotals(payload({ paid: 100000, cod: true }), 'delivery')).toMatchObject({
      paid: 100000,
      cod: 150000,
    });
    expect(posTotals(payload({ paid: 100000, cod: false }), 'delivery').cod).toBe(0);
    expect(posTotals(payload({ cod: true }), 'retail').cod).toBe(0);
  });
  it('caps what is paid at the total', () => {
    expect(posTotals(payload({ paid: 9_000_000 }), 'retail').paid).toBe(250000);
  });
});

describe('handoverDeadline', () => {
  it('is midnight at the end of the day after creation, Vietnam time', () => {
    // 23/11/2026 00:12 +07 -> 25/11/2026 00:00 +07
    expect(handoverDeadline(new Date('2026-11-23T00:12:00+07:00')).toISOString()).toBe(
      new Date('2026-11-25T00:00:00+07:00').toISOString(),
    );
    expect(handoverDeadline(new Date('2026-11-23T23:59:00+07:00')).toISOString()).toBe(
      new Date('2026-11-25T00:00:00+07:00').toISOString(),
    );
  });
});
