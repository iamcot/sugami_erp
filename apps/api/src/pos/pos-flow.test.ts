import { describe, expect, it } from 'vitest';
import { fulfillmentOf, holdsStock, posActions } from './pos-flow.js';

describe('counter order state machine', () => {
  it('walks a delivery from new to completed and takes stock only when shipped', () => {
    let status = 'new';
    const took: string[] = [];
    for (const key of ['confirm', 'pack', 'ship', 'deliver', 'complete']) {
      const a = posActions('delivery', status).find((x) => x.key === key);
      expect(a, `${key} from ${status}`).toBeDefined();
      if (a!.stock === 'take') took.push(a!.key);
      status = a!.to;
    }
    expect(status).toBe('completed');
    expect(took).toEqual(['ship']);
  });
  it('cancelling before shipping moves no stock', () => {
    for (const s of ['new', 'confirmed', 'packing'])
      expect(posActions('delivery', s).find((a) => a.key === 'cancel')?.stock).toBeNull();
  });
  it('cannot cancel a parcel that is already out, only return it', () => {
    expect(posActions('delivery', 'shipped').map((a) => a.key)).toEqual(['deliver', 'return']);
  });
  it('offers nothing from a final status', () => {
    expect(posActions('delivery', 'returned')).toEqual([]);
    expect(posActions('retail', 'cancelled')).toEqual([]);
  });
  it('retail gives stock back on return or cancel', () => {
    expect(posActions('retail', 'completed').map((a) => [a.key, a.stock])).toEqual([
      ['return', 'give'],
      ['cancel', 'give'],
    ]);
  });
  it('stock is out of the warehouse from shipped on (delivery) or at the sale (retail)', () => {
    expect(holdsStock('delivery', 'packing')).toBe(false);
    expect(holdsStock('delivery', 'shipped')).toBe(true);
    expect(holdsStock('retail', 'completed')).toBe(true);
  });
  it('infers the kind of an older order', () => {
    const o = { fulfillment: null, shipAddress: null, shipPhone: null, carrier: null };
    expect(fulfillmentOf(o)).toBe('retail');
    expect(fulfillmentOf({ ...o, shipPhone: '090' })).toBe('delivery');
  });
});
